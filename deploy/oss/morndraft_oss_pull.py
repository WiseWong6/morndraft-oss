#!/usr/bin/env python3
"""Fail-closed pull deployment for the public MornDraft static release artifact."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import fcntl
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import sys
import tarfile
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile


REPOSITORY = "WiseWong6/morndraft-oss"
WORKFLOW_FILE = "oss-release.yml"
ARTIFACT_PREFIX = "morndraft-oss-release-"
SOURCE_SHA_RE = re.compile(r"^[0-9a-f]{40}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
MAX_API_BYTES = 4 * 1024 * 1024
MAX_ARTIFACT_BYTES = 64 * 1024 * 1024
MAX_UNPACKED_BYTES = 128 * 1024 * 1024
MAX_RELEASE_FILES = 2_000
MAX_TAR_STREAM_BYTES = MAX_UNPACKED_BYTES + (MAX_RELEASE_FILES * 1024) + (1024 * 1024)


class ReleaseError(RuntimeError):
    """A validation or deployment gate failed."""


class LiveVerificationError(ReleaseError):
    """The target became current but did not complete live verification."""

    def __init__(self, cause: Exception):
        super().__init__(str(cause))
        self.reason = type(cause).__name__


def raise_on_termination(signum, _frame) -> None:
    """Turn service termination into a catchable deployment failure."""

    try:
        signal_name = signal.Signals(signum).name
    except ValueError:
        signal_name = str(signum)
    raise ReleaseError(f"Deployment interrupted by {signal_name}")


class BoundedReader:
    """Count bytes emitted by a decompressor and fail before its hard limit is crossed."""

    def __init__(self, handle, limit: int):
        self._handle = handle
        self._limit = limit
        self._total = 0

    def read(self, size: int = -1) -> bytes:
        remaining = self._limit - self._total
        requested = remaining + 1 if size < 0 or size > remaining + 1 else size
        value = self._handle.read(requested)
        self._total += len(value)
        if self._total > self._limit:
            raise ReleaseError("Release tar stream exceeds the reviewed decompression budget")
        return value


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        return None


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_bounded(handle, limit: int) -> bytes:
    value = handle.read(limit + 1)
    if len(value) > limit:
        raise ReleaseError(f"Response exceeds the {limit}-byte safety limit")
    return value


def safe_relative_path(value: str) -> tuple[str, ...]:
    if (
        not isinstance(value, str)
        or not value
        or "\\" in value
        or value.startswith("/")
        or any(ord(character) < 32 or ord(character) == 127 for character in value)
    ):
        raise ReleaseError(f"Unsafe archive path: {value!r}")
    parts = tuple(value.split("/"))
    if any(part in ("", ".", "..") for part in parts):
        raise ReleaseError(f"Unsafe archive path: {value!r}")
    return parts


def strict_json_loads(value: bytes):
    def reject_duplicate_keys(pairs):
        result = {}
        for key, item in pairs:
            if key in result:
                raise ReleaseError(f"Duplicate JSON key: {key}")
            result[key] = item
        return result

    try:
        return json.loads(value.decode("utf-8"), object_pairs_hook=reject_duplicate_keys)
    except (UnicodeDecodeError, json.JSONDecodeError) as cause:
        raise ReleaseError("Release JSON is not valid UTF-8 JSON") from cause


def require_exact_keys(value: dict, expected: set[str], label: str) -> None:
    actual = set(value)
    if actual != expected:
        raise ReleaseError(
            f"{label} keys differ from schema: missing={sorted(expected - actual)}, "
            f"unexpected={sorted(actual - expected)}"
        )


def require_nonnegative_integer(value, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ReleaseError(f"{label} must be a nonnegative integer")
    return value


def validate_manifest(raw: bytes, *, expected_run_id: int, expected_sha: str) -> dict:
    manifest = strict_json_loads(raw)
    if not isinstance(manifest, dict):
        raise ReleaseError("Release manifest must be an object")
    require_exact_keys(
        manifest,
        {
            "schemaVersion",
            "repository",
            "sourceSha",
            "workflowRunId",
            "workflowName",
            "buildProfile",
            "distributionProfile",
            "archive",
            "fileCount",
            "totalBytes",
            "files",
        },
        "release manifest",
    )
    if manifest["schemaVersion"] != 1:
        raise ReleaseError("Unsupported release manifest schema")
    if manifest["repository"] != REPOSITORY:
        raise ReleaseError("Release manifest repository does not match the configured public repository")
    if manifest["sourceSha"] != expected_sha or not SOURCE_SHA_RE.fullmatch(expected_sha):
        raise ReleaseError("Release manifest source SHA does not match the workflow run")
    if manifest["workflowRunId"] != expected_run_id:
        raise ReleaseError("Release manifest workflow run ID does not match the artifact owner")
    if manifest["workflowName"] != "OSS release":
        raise ReleaseError("Release manifest workflow name is not the reviewed release workflow")
    if manifest["buildProfile"] != "oss-full" or manifest["distributionProfile"] != "oss":
        raise ReleaseError("Release manifest does not describe the reviewed OSS profile")

    archive = manifest["archive"]
    if not isinstance(archive, dict):
        raise ReleaseError("Release manifest archive must be an object")
    require_exact_keys(archive, {"fileName", "sha256", "size"}, "release archive")
    expected_archive_name = f"morndraft-oss-{expected_sha}.tar.gz"
    if archive["fileName"] != expected_archive_name:
        raise ReleaseError("Release archive name does not match the source SHA")
    if not isinstance(archive["sha256"], str) or not SHA256_RE.fullmatch(archive["sha256"]):
        raise ReleaseError("Release archive SHA-256 is invalid")
    archive_size = require_nonnegative_integer(archive["size"], "release archive size")
    if archive_size == 0 or archive_size > MAX_ARTIFACT_BYTES:
        raise ReleaseError("Release archive size is outside the reviewed budget")

    files = manifest["files"]
    if not isinstance(files, list) or not files or len(files) > MAX_RELEASE_FILES:
        raise ReleaseError("Release manifest file list is empty or exceeds the reviewed budget")
    expected_paths = []
    total_bytes = 0
    for index, entry in enumerate(files):
        if not isinstance(entry, dict):
            raise ReleaseError(f"Release file {index} must be an object")
        require_exact_keys(entry, {"path", "sha256", "size"}, f"release file {index}")
        safe_relative_path(entry["path"])
        if not isinstance(entry["sha256"], str) or not SHA256_RE.fullmatch(entry["sha256"]):
            raise ReleaseError(f"Release file {entry['path']} has an invalid SHA-256")
        size = require_nonnegative_integer(entry["size"], f"release file {entry['path']} size")
        total_bytes += size
        expected_paths.append(entry["path"])
    if expected_paths != sorted(expected_paths) or len(set(expected_paths)) != len(expected_paths):
        raise ReleaseError("Release manifest paths must be sorted and unique")
    if "index.html" not in expected_paths:
        raise ReleaseError("Release manifest is missing index.html")
    if manifest["fileCount"] != len(files):
        raise ReleaseError("Release manifest file count is inconsistent")
    if manifest["totalBytes"] != total_bytes or total_bytes > MAX_UNPACKED_BYTES:
        raise ReleaseError("Release manifest unpacked size is inconsistent or too large")
    return manifest


def parse_sha256sums(raw: bytes, archive_name: str) -> dict[str, str]:
    try:
        text = raw.decode("ascii")
    except UnicodeDecodeError as cause:
        raise ReleaseError("SHA256SUMS must be ASCII") from cause
    lines = text.splitlines()
    if len(lines) != 2 or not text.endswith("\n"):
        raise ReleaseError("SHA256SUMS must contain exactly the archive and manifest digests")
    result = {}
    for line in lines:
        match = re.fullmatch(r"([0-9a-f]{64})  ([A-Za-z0-9_.-]+)", line)
        if not match or match.group(2) in result:
            raise ReleaseError("SHA256SUMS contains an invalid or duplicate entry")
        result[match.group(2)] = match.group(1)
    if set(result) != {archive_name, "release-manifest.json"}:
        raise ReleaseError("SHA256SUMS names do not match the release package")
    return result


def validate_artifact_zip(
    artifact_path: Path,
    *,
    expected_digest: str,
    expected_run_id: int,
    expected_sha: str,
) -> tuple[dict, bytes]:
    if not SHA256_RE.fullmatch(expected_digest):
        raise ReleaseError("GitHub artifact digest is missing or invalid")
    if sha256_file(artifact_path) != expected_digest:
        raise ReleaseError("Downloaded artifact ZIP does not match the GitHub artifact digest")
    if artifact_path.stat().st_size > MAX_ARTIFACT_BYTES:
        raise ReleaseError("Downloaded artifact ZIP exceeds the reviewed size budget")

    try:
        with zipfile.ZipFile(artifact_path) as archive:
            infos = archive.infolist()
            if len(infos) != 3:
                raise ReleaseError("Release artifact ZIP must contain exactly three regular files")
            total_bytes = 0
            values = {}
            for info in infos:
                parts = safe_relative_path(info.filename)
                if len(parts) != 1 or info.is_dir() or info.flag_bits & 0x1:
                    raise ReleaseError("Release artifact ZIP contains a directory, nested path, or encrypted member")
                unix_mode = info.external_attr >> 16
                file_type = stat.S_IFMT(unix_mode)
                if file_type not in (0, stat.S_IFREG):
                    raise ReleaseError("Release artifact ZIP contains a symbolic link or special file")
                total_bytes += info.file_size
                if total_bytes > MAX_ARTIFACT_BYTES:
                    raise ReleaseError("Release artifact ZIP expands beyond the reviewed size budget")
                values[info.filename] = read_bounded(archive.open(info), MAX_ARTIFACT_BYTES)
    except (zipfile.BadZipFile, zipfile.LargeZipFile) as cause:
        raise ReleaseError("Downloaded artifact is not a valid ZIP archive") from cause

    manifest_raw = values.get("release-manifest.json")
    sums_raw = values.get("SHA256SUMS")
    if manifest_raw is None or sums_raw is None:
        raise ReleaseError("Release artifact is missing its manifest or checksum file")
    manifest = validate_manifest(
        manifest_raw,
        expected_run_id=expected_run_id,
        expected_sha=expected_sha,
    )
    archive_name = manifest["archive"]["fileName"]
    if set(values) != {"release-manifest.json", "SHA256SUMS", archive_name}:
        raise ReleaseError("Release artifact file set does not match its manifest")
    checksums = parse_sha256sums(sums_raw, archive_name)
    if sha256_bytes(manifest_raw) != checksums["release-manifest.json"]:
        raise ReleaseError("Release manifest does not match SHA256SUMS")
    archive_bytes = values[archive_name]
    if len(archive_bytes) != manifest["archive"]["size"]:
        raise ReleaseError("Release archive size does not match its manifest")
    archive_digest = sha256_bytes(archive_bytes)
    if archive_digest != manifest["archive"]["sha256"] or archive_digest != checksums[archive_name]:
        raise ReleaseError("Release archive does not match its manifest and SHA256SUMS")
    return manifest, archive_bytes


def inspect_tar(archive_bytes: bytes, manifest: dict) -> None:
    expected = {entry["path"]: entry for entry in manifest["files"]}
    seen_files = set()
    seen_members = set()
    total_bytes = 0
    try:
        with gzip.GzipFile(fileobj=io.BytesIO(archive_bytes), mode="rb") as compressed:
            bounded = BoundedReader(compressed, MAX_TAR_STREAM_BYTES)
            with tarfile.open(fileobj=bounded, mode="r|") as archive:
                member_count = 0
                for member in archive:
                    member_count += 1
                    if member_count > MAX_RELEASE_FILES * 2:
                        raise ReleaseError("Release archive has too many members")
                    parts = safe_relative_path(member.name.rstrip("/"))
                    normalized_member = "/".join(parts)
                    if normalized_member in seen_members:
                        raise ReleaseError("Release archive contains duplicate member names")
                    seen_members.add(normalized_member)
                    if parts[0] != "site":
                        raise ReleaseError("Release archive member is outside the site root")
                    if member.issym() or member.islnk() or member.ischr() or member.isblk() or member.isfifo():
                        raise ReleaseError("Release archive contains a link or special file")
                    if member.isdir():
                        continue
                    if not member.isreg() or len(parts) < 2:
                        raise ReleaseError("Release archive contains an unsupported member")
                    relative_path = "/".join(parts[1:])
                    if relative_path in seen_files or relative_path not in expected:
                        raise ReleaseError("Release archive file set differs from the manifest")
                    seen_files.add(relative_path)
                    total_bytes += member.size
                    if total_bytes > MAX_UNPACKED_BYTES or member.size != expected[relative_path]["size"]:
                        raise ReleaseError("Release archive file size differs from the manifest or exceeds budget")
                    source = archive.extractfile(member)
                    if source is None:
                        raise ReleaseError("Release archive regular file could not be read")
                    digest = hashlib.sha256()
                    read_bytes = 0
                    for chunk in iter(lambda: source.read(1024 * 1024), b""):
                        read_bytes += len(chunk)
                        if read_bytes > member.size:
                            raise ReleaseError("Release archive member exceeds its declared size")
                        digest.update(chunk)
                    if read_bytes != member.size or digest.hexdigest() != expected[relative_path]["sha256"]:
                        raise ReleaseError("Release archive file digest differs from the manifest")
    except ReleaseError:
        raise
    except (OSError, tarfile.TarError, EOFError) as cause:
        raise ReleaseError("Release archive is not a valid gzip-compressed tar") from cause
    if seen_files != set(expected):
        raise ReleaseError("Release archive is missing files declared by the manifest")


def ensure_public_directory_modes(root_dir: Path) -> None:
    """Keep verified static directories traversable despite the service umask."""

    for root, directories, _ in os.walk(root_dir, followlinks=False):
        root_path = Path(root)
        if root_path.is_symlink():
            raise ReleaseError("Release directory contains a symbolic link")
        root_path.chmod(0o755)
        for directory in directories:
            directory_path = root_path / directory
            if directory_path.is_symlink():
                raise ReleaseError("Release directory contains a symbolic link")
            directory_path.chmod(0o755)


def extract_verified_tar(archive_bytes: bytes, manifest: dict, target_dir: Path) -> None:
    inspect_tar(archive_bytes, manifest)
    target_dir.mkdir(mode=0o755)
    try:
        with gzip.GzipFile(fileobj=io.BytesIO(archive_bytes), mode="rb") as compressed:
            bounded = BoundedReader(compressed, MAX_TAR_STREAM_BYTES)
            with tarfile.open(fileobj=bounded, mode="r|") as archive:
                for member in archive:
                    parts = safe_relative_path(member.name.rstrip("/"))
                    if parts[0] != "site" or len(parts) == 1:
                        continue
                    target_path = target_dir.joinpath(*parts[1:])
                    if member.isdir():
                        target_path.mkdir(parents=True, exist_ok=True, mode=0o755)
                        continue
                    target_path.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
                    source = archive.extractfile(member)
                    if source is None:
                        raise ReleaseError("Release archive regular file could not be extracted")
                    with target_path.open("xb") as destination:
                        shutil.copyfileobj(source, destination, length=1024 * 1024)
                    target_path.chmod(0o644)
        (target_dir / ".release-manifest.json").write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        # The service deliberately keeps a restrictive umask for state files.
        # Static directories must nevertheless remain traversable by Nginx.
        ensure_public_directory_modes(target_dir)
    except Exception:
        shutil.rmtree(target_dir, ignore_errors=True)
        raise


def verify_release_directory(release_dir: Path, manifest: dict) -> None:
    expected = {entry["path"]: entry for entry in manifest["files"]}
    actual = set()
    for root, directories, files in os.walk(release_dir, followlinks=False):
        root_path = Path(root)
        for directory in directories:
            if (root_path / directory).is_symlink():
                raise ReleaseError("Existing release directory contains a symbolic link")
        for file_name in files:
            file_path = root_path / file_name
            relative_path = file_path.relative_to(release_dir).as_posix()
            if relative_path == ".release-manifest.json":
                continue
            if file_path.is_symlink() or not file_path.is_file() or relative_path not in expected:
                raise ReleaseError("Existing release directory contains an unexpected file")
            metadata = file_path.stat()
            entry = expected[relative_path]
            if metadata.st_size != entry["size"] or sha256_file(file_path) != entry["sha256"]:
                raise ReleaseError("Existing release directory differs from the signed manifest")
            actual.add(relative_path)
    if actual != set(expected):
        raise ReleaseError("Existing release directory is incomplete")


class GitHubClient:
    def __init__(self, token: str):
        if not token or any(character.isspace() for character in token):
            raise ReleaseError("GitHub credential is empty or malformed")
        self._token = token

    def _request(self, url: str, *, accept: str) -> urllib.request.Request:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != "https" or parsed.hostname != "api.github.com":
            raise ReleaseError("Refusing to request a non-GitHub API origin")
        return urllib.request.Request(
            url,
            headers={
                "Accept": accept,
                "Authorization": f"Bearer {self._token}",
                "User-Agent": "morndraft-oss-pull/1",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )

    def json(self, path: str) -> dict:
        url = f"https://api.github.com/repos/{REPOSITORY}/{path.lstrip('/')}"
        try:
            with urllib.request.urlopen(
                self._request(url, accept="application/vnd.github+json"),
                timeout=20,
            ) as response:
                value = strict_json_loads(read_bounded(response, MAX_API_BYTES))
                if not isinstance(value, dict):
                    raise ReleaseError("GitHub API response must be a JSON object")
                return value
        except (urllib.error.URLError, TimeoutError) as cause:
            raise ReleaseError(f"GitHub API request failed for {path}") from cause

    def download(self, url: str, destination: Path) -> None:
        opener = urllib.request.build_opener(NoRedirectHandler())
        try:
            request = self._request(url, accept="application/vnd.github+json")
            try:
                response = opener.open(request, timeout=30)
            except urllib.error.HTTPError as redirect:
                if redirect.code not in (301, 302, 303, 307, 308):
                    raise
                location = redirect.headers.get("Location")
                parsed = urllib.parse.urlparse(location or "")
                allowed_suffixes = (".blob.core.windows.net", ".githubusercontent.com", ".github.com")
                if (
                    parsed.scheme != "https"
                    or not parsed.hostname
                    or not any(parsed.hostname.endswith(suffix) for suffix in allowed_suffixes)
                ):
                    raise ReleaseError("GitHub artifact redirected outside an approved HTTPS download origin")
                # The signed redirect URL needs no bearer credential. Opening a
                # fresh request prevents the Actions-read token from crossing
                # the api.github.com origin.
                response = opener.open(
                    urllib.request.Request(
                        location,
                        headers={"Accept": "application/octet-stream", "User-Agent": "morndraft-oss-pull/1"},
                    ),
                    timeout=60,
                )
            with response, destination.open("xb") as output:
                if response.status != 200:
                    raise ReleaseError("GitHub artifact download did not return HTTP 200")
                total = 0
                for chunk in iter(lambda: response.read(1024 * 1024), b""):
                    total += len(chunk)
                    if total > MAX_ARTIFACT_BYTES:
                        raise ReleaseError("GitHub artifact download exceeds the reviewed size budget")
                    output.write(chunk)
        except (urllib.error.URLError, TimeoutError) as cause:
            destination.unlink(missing_ok=True)
            raise ReleaseError("GitHub artifact download failed") from cause


def read_credential() -> str:
    credentials_directory = os.environ.get("CREDENTIALS_DIRECTORY")
    if not credentials_directory:
        raise ReleaseError("CREDENTIALS_DIRECTORY is not set; use systemd LoadCredential")
    credential_path = Path(credentials_directory) / "github_token"
    return credential_path.read_text(encoding="utf-8").strip()


def find_current_successful_run(client: GitHubClient) -> dict:
    branch = client.json("branches/main")
    current_sha = branch.get("commit", {}).get("sha")
    if not isinstance(current_sha, str) or not SOURCE_SHA_RE.fullmatch(current_sha):
        raise ReleaseError("GitHub main branch did not return a valid commit SHA")
    runs = client.json(
        f"actions/workflows/{WORKFLOW_FILE}/runs?branch=main&event=push&status=success&per_page=20"
    ).get("workflow_runs")
    if not isinstance(runs, list):
        raise ReleaseError("GitHub release workflow response is malformed")
    for run in runs:
        if not isinstance(run, dict):
            continue
        head_repository = run.get("head_repository")
        if (
            run.get("head_sha") == current_sha
            and run.get("head_branch") == "main"
            and run.get("event") == "push"
            and run.get("status") == "completed"
            and run.get("conclusion") == "success"
            and isinstance(head_repository, dict)
            and head_repository.get("full_name") == REPOSITORY
        ):
            return run
    raise ReleaseError("The current main SHA has no successful push release workflow")


def find_release_artifact(client: GitHubClient, run: dict) -> tuple[dict, str]:
    run_id = run.get("id")
    source_sha = run.get("head_sha")
    if isinstance(run_id, bool) or not isinstance(run_id, int) or run_id <= 0:
        raise ReleaseError("Release workflow run ID is invalid")
    expected_name = f"{ARTIFACT_PREFIX}{source_sha}"
    artifacts = client.json(f"actions/runs/{run_id}/artifacts?per_page=100").get("artifacts")
    if not isinstance(artifacts, list):
        raise ReleaseError("GitHub artifact response is malformed")
    matches = [
        artifact for artifact in artifacts
        if isinstance(artifact, dict) and artifact.get("name") == expected_name
    ]
    if len(matches) != 1:
        raise ReleaseError("Release workflow must own exactly one exact-SHA release artifact")
    artifact = matches[0]
    workflow_run = artifact.get("workflow_run")
    if (
        artifact.get("expired") is not False
        or not isinstance(workflow_run, dict)
        or workflow_run.get("id") != run_id
    ):
        raise ReleaseError("Release artifact is expired or belongs to a different workflow run")
    size = artifact.get("size_in_bytes")
    if isinstance(size, bool) or not isinstance(size, int) or size <= 0 or size > MAX_ARTIFACT_BYTES:
        raise ReleaseError("GitHub release artifact size is outside the reviewed budget")
    digest = artifact.get("digest")
    if not isinstance(digest, str) or not digest.startswith("sha256:"):
        raise ReleaseError("GitHub release artifact has no SHA-256 digest")
    if isinstance(artifact.get("id"), bool) or not isinstance(artifact.get("id"), int):
        raise ReleaseError("GitHub release artifact ID is invalid")
    archive_download_url = artifact.get("archive_download_url")
    if not isinstance(archive_download_url, str):
        raise ReleaseError("GitHub release artifact has no download URL")
    return artifact, digest.removeprefix("sha256:")


def stage_release(
    releases_dir: Path,
    manifest: dict,
    archive_bytes: bytes,
) -> Path:
    source_sha = manifest["sourceSha"]
    release_dir = releases_dir / source_sha
    releases_dir.mkdir(parents=True, exist_ok=True, mode=0o755)
    if release_dir.exists():
        if not release_dir.is_dir() or release_dir.is_symlink():
            raise ReleaseError("Exact-SHA release path exists but is not a regular directory")
        verify_release_directory(release_dir, manifest)
        ensure_public_directory_modes(release_dir)
        return release_dir
    for stale in releases_dir.glob(f".{source_sha}.staging-*"):
        if stale.is_dir() and not stale.is_symlink():
            shutil.rmtree(stale)
    staging_dir = releases_dir / f".{source_sha}.staging-{uuid.uuid4().hex}"
    extract_verified_tar(archive_bytes, manifest, staging_dir)
    try:
        os.replace(staging_dir, release_dir)
    except Exception:
        shutil.rmtree(staging_dir, ignore_errors=True)
        raise
    return release_dir


def read_current_sha(current_link: Path) -> str | None:
    if not current_link.exists() and not current_link.is_symlink():
        return None
    if not current_link.is_symlink():
        raise ReleaseError("Current release path must be a symbolic link")
    target = Path(os.readlink(current_link))
    if target.is_absolute() or len(target.parts) != 2 or target.parts[0] != "releases":
        raise ReleaseError("Current release link must point to releases/<exact-sha>")
    candidate = target.parts[1]
    if not SOURCE_SHA_RE.fullmatch(candidate):
        raise ReleaseError("Current release link does not point to an exact-SHA directory")
    return candidate


def atomic_switch(current_link: Path, source_sha: str) -> str | None:
    previous_sha = read_current_sha(current_link)
    current_link.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
    next_link = current_link.parent / f".current.next-{uuid.uuid4().hex}"
    os.symlink(f"releases/{source_sha}", next_link)
    try:
        os.replace(next_link, current_link)
    finally:
        next_link.unlink(missing_ok=True)
    return previous_sha


def switch_and_verify(
    current_link: Path,
    source_sha: str,
    health_url: str,
    expected_index_sha256: str,
) -> str | None:
    """Switch to a release and restore the prior link on any failure or signal."""

    previous_sha = read_current_sha(current_link)
    switch_completed = False
    try:
        atomic_switch(current_link, source_sha)
        switch_completed = True
        verify_health(health_url, expected_index_sha256)
    except Exception as cause:
        # Re-read the link because SIGTERM can arrive after os.replace() but
        # before atomic_switch() returns to this frame.
        active_sha = read_current_sha(current_link)
        target_became_current = active_sha == source_sha and (
            switch_completed or previous_sha != source_sha
        )
        if target_became_current:
            if previous_sha and previous_sha != source_sha:
                atomic_switch(current_link, previous_sha)
            elif previous_sha is None:
                current_link.unlink(missing_ok=True)
            raise LiveVerificationError(cause) from cause
        raise
    return previous_sha


def verify_health(health_url: str, expected_index_sha256: str) -> None:
    parsed = urllib.parse.urlparse(health_url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ReleaseError("Health URL must be an explicit HTTPS URL")
    request = urllib.request.Request(
        health_url,
        headers={
            "Accept": "text/html",
            "Accept-Encoding": "identity",
            "User-Agent": "morndraft-oss-health/1",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            final = urllib.parse.urlparse(response.geturl())
            if final.scheme != "https" or final.hostname != parsed.hostname or response.status != 200:
                raise ReleaseError("Static health request redirected outside the reviewed HTTPS origin")
            body = read_bounded(response, 4 * 1024 * 1024)
    except (urllib.error.URLError, TimeoutError) as cause:
        raise ReleaseError("Static health request failed") from cause
    if sha256_bytes(body) != expected_index_sha256:
        raise ReleaseError("Live index.html does not match the deployed release manifest")


def write_json_atomic(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
    temporary = path.parent / f".{path.name}.{uuid.uuid4().hex}.tmp"
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def cleanup_releases(releases_dir: Path, current_sha: str, keep: int = 5) -> None:
    if keep < 1:
        raise ReleaseError("At least one release must be retained")
    candidates = []
    for entry in releases_dir.iterdir():
        if entry.is_dir() and not entry.is_symlink() and SOURCE_SHA_RE.fullmatch(entry.name):
            marker = entry / ".release-manifest.json"
            try:
                run_id = strict_json_loads(marker.read_bytes()).get("workflowRunId", 0)
            except (OSError, ReleaseError):
                run_id = 0
            candidates.append((run_id if isinstance(run_id, int) else 0, entry))
    candidates.sort(key=lambda item: (item[0], item[1].name), reverse=True)
    keep_names = {current_sha}
    for _, entry in candidates:
        if len(keep_names) >= keep:
            break
        keep_names.add(entry.name)
    for _, entry in candidates:
        if entry.name not in keep_names:
            shutil.rmtree(entry)


def load_installed_manifest(releases_dir: Path, source_sha: str) -> tuple[Path, dict]:
    release_dir = releases_dir / source_sha
    marker_path = release_dir / ".release-manifest.json"
    if not release_dir.is_dir() or release_dir.is_symlink() or not marker_path.is_file():
        raise ReleaseError("Release target is not an installed verified release")
    marker_raw = marker_path.read_bytes()
    marker = strict_json_loads(marker_raw)
    if not isinstance(marker, dict):
        raise ReleaseError("Installed release marker is malformed")
    marker_run_id = marker.get("workflowRunId")
    if isinstance(marker_run_id, bool) or not isinstance(marker_run_id, int) or marker_run_id <= 0:
        raise ReleaseError("Installed release marker has no valid workflow run ID")
    marker = validate_manifest(
        marker_raw,
        expected_run_id=marker_run_id,
        expected_sha=source_sha,
    )
    verify_release_directory(release_dir, marker)
    return release_dir, marker


@contextmanager
def deployment_lock(state_dir: Path):
    lock_path = state_dir / "deploy.lock"
    with lock_path.open("a+b") as lock_handle:
        os.fchmod(lock_handle.fileno(), 0o640)
        try:
            fcntl.flock(lock_handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as cause:
            raise ReleaseError("Another MornDraft OSS deployment or rollback is already running") from cause
        try:
            yield
        finally:
            fcntl.flock(lock_handle.fileno(), fcntl.LOCK_UN)


def rollback_release(
    *,
    current_link: Path,
    releases_dir: Path,
    state_dir: Path,
    source_sha: str,
    health_url: str,
) -> None:
    if source_sha == "previous":
        previous_path = state_dir / "previous-sha"
        source_sha = previous_path.read_text(encoding="ascii").strip()
    if not SOURCE_SHA_RE.fullmatch(source_sha):
        raise ReleaseError("Rollback target must be an exact source SHA or 'previous'")
    _, marker = load_installed_manifest(releases_dir, source_sha)
    marker_run_id = marker["workflowRunId"]
    expected_index = next(
        (entry["sha256"] for entry in marker.get("files", []) if entry.get("path") == "index.html"),
        None,
    )
    if not isinstance(expected_index, str) or not SHA256_RE.fullmatch(expected_index):
        raise ReleaseError("Rollback release marker has no valid index.html digest")
    outgoing_sha = read_current_sha(current_link)
    outgoing_manifest = None
    if outgoing_sha and outgoing_sha != source_sha:
        _, outgoing_manifest = load_installed_manifest(releases_dir, outgoing_sha)
    old_sha = switch_and_verify(current_link, source_sha, health_url, expected_index)
    if old_sha:
        (state_dir / "previous-sha").write_text(f"{old_sha}\n", encoding="ascii")
    if outgoing_manifest is not None:
        outgoing_run_id = outgoing_manifest["workflowRunId"]
        write_json_atomic(
            state_dir / "failed-runs" / f"{outgoing_run_id}.json",
            {
                "sourceSha": outgoing_sha,
                "workflowRunId": outgoing_run_id,
                "reason": "manual-rollback",
                "rolledBackTo": source_sha,
            },
        )
    write_json_atomic(
        state_dir / "deployed.json",
        {"sourceSha": source_sha, "workflowRunId": marker_run_id, "rollback": True},
    )
    cleanup_releases(releases_dir, source_sha)


def deploy_locked(args, *, releases_dir: Path, state_dir: Path, current_link: Path) -> None:
    if args.rollback:
        rollback_release(
            current_link=current_link,
            releases_dir=releases_dir,
            state_dir=state_dir,
            source_sha=args.rollback,
            health_url=args.health_url,
        )
        print(f"[morndraft-oss-pull] rolled back to {read_current_sha(current_link)}")
        return

    client = GitHubClient(read_credential())
    run = find_current_successful_run(client)
    run_id = run["id"]
    source_sha = run["head_sha"]
    failed_marker = state_dir / "failed-runs" / f"{run_id}.json"
    if failed_marker.exists():
        raise ReleaseError("Current main release run is marked failed; a new main SHA is required")
    deployed_path = state_dir / "deployed.json"
    if deployed_path.exists():
        deployed = strict_json_loads(deployed_path.read_bytes())
        if deployed.get("sourceSha") == source_sha and read_current_sha(current_link) == source_sha:
            print(f"[morndraft-oss-pull] {source_sha} is already current")
            return

    artifact, artifact_digest = find_release_artifact(client, run)
    with tempfile.TemporaryDirectory(prefix="morndraft-oss-artifact-", dir=state_dir) as temporary:
        artifact_path = Path(temporary) / "artifact.zip"
        client.download(artifact["archive_download_url"], artifact_path)
        manifest, archive_bytes = validate_artifact_zip(
            artifact_path,
            expected_digest=artifact_digest,
            expected_run_id=run_id,
            expected_sha=source_sha,
        )
    stage_release(releases_dir, manifest, archive_bytes)
    if args.stage_only:
        print(f"[morndraft-oss-pull] staged {source_sha} without switching current")
        return

    expected_index = next(entry["sha256"] for entry in manifest["files"] if entry["path"] == "index.html")
    previous_sha = read_current_sha(current_link)
    try:
        switch_and_verify(current_link, source_sha, args.health_url, expected_index)
    except LiveVerificationError as cause:
        write_json_atomic(
            failed_marker,
            {"sourceSha": source_sha, "workflowRunId": run_id, "reason": cause.reason},
        )
        raise
    if previous_sha and previous_sha != source_sha:
        (state_dir / "previous-sha").write_text(f"{previous_sha}\n", encoding="ascii")
    write_json_atomic(
        deployed_path,
        {"sourceSha": source_sha, "workflowRunId": run_id, "artifactId": artifact["id"]},
    )
    cleanup_releases(releases_dir, source_sha)
    print(f"[morndraft-oss-pull] deployed {source_sha} from workflow run {run_id}")


def deploy(args) -> None:
    releases_dir = args.root / "releases"
    state_dir = args.root / "state"
    current_link = args.root / "current"
    state_dir.mkdir(parents=True, exist_ok=True, mode=0o750)
    with deployment_lock(state_dir):
        deploy_locked(
            args,
            releases_dir=releases_dir,
            state_dir=state_dir,
            current_link=current_link,
        )


def parse_args(argv: list[str]):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(os.environ.get("MORNDRAFT_STATIC_ROOT", "/srv/morndraft-static")),
    )
    parser.add_argument(
        "--health-url",
        default=os.environ.get("MORNDRAFT_HEALTH_URL", "https://morndraft.com/"),
    )
    parser.add_argument(
        "--stage-only",
        action="store_true",
        default=os.environ.get("MORNDRAFT_STAGE_ONLY", "0").lower() in {"1", "true", "yes"},
    )
    parser.add_argument("--rollback", metavar="SHA_OR_PREVIOUS")
    args = parser.parse_args(argv)
    if args.stage_only and args.rollback:
        parser.error("--stage-only and --rollback cannot be combined")
    return args


def main(argv: list[str] | None = None) -> int:
    signal.signal(signal.SIGTERM, raise_on_termination)
    signal.signal(signal.SIGINT, raise_on_termination)
    try:
        deploy(parse_args(sys.argv[1:] if argv is None else argv))
        return 0
    except (OSError, ReleaseError) as cause:
        print(f"[morndraft-oss-pull] {cause}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
