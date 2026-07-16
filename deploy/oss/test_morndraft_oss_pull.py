import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import stat
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import zipfile

import morndraft_oss_pull as pull


SOURCE_SHA = "1234567890abcdef1234567890abcdef12345678"
RUN_ID = 42


def build_release(files, *, source_sha=SOURCE_SHA, run_id=RUN_ID):
    file_entries = []
    tar_buffer = io.BytesIO()
    with tarfile.open(fileobj=tar_buffer, mode="w:gz") as archive:
        site = tarfile.TarInfo("site")
        site.type = tarfile.DIRTYPE
        site.mode = 0o755
        archive.addfile(site)
        for path, value in sorted(files.items()):
            info = tarfile.TarInfo(f"site/{path}")
            info.size = len(value)
            info.mode = 0o644
            archive.addfile(info, io.BytesIO(value))
            file_entries.append({
                "path": path,
                "sha256": hashlib.sha256(value).hexdigest(),
                "size": len(value),
            })
    archive_bytes = tar_buffer.getvalue()
    archive_name = f"morndraft-oss-{source_sha}.tar.gz"
    manifest = {
        "schemaVersion": 1,
        "repository": pull.REPOSITORY,
        "sourceSha": source_sha,
        "workflowRunId": run_id,
        "workflowName": "OSS release",
        "buildProfile": "oss-full",
        "distributionProfile": "oss",
        "archive": {
            "fileName": archive_name,
            "sha256": hashlib.sha256(archive_bytes).hexdigest(),
            "size": len(archive_bytes),
        },
        "fileCount": len(file_entries),
        "totalBytes": sum(entry["size"] for entry in file_entries),
        "files": file_entries,
    }
    manifest_bytes = (json.dumps(manifest, indent=2) + "\n").encode()
    sums = (
        f"{manifest['archive']['sha256']}  {archive_name}\n"
        f"{hashlib.sha256(manifest_bytes).hexdigest()}  release-manifest.json\n"
    ).encode()
    outer = io.BytesIO()
    with zipfile.ZipFile(outer, mode="w") as artifact:
        artifact.writestr(archive_name, archive_bytes)
        artifact.writestr("release-manifest.json", manifest_bytes)
        artifact.writestr("SHA256SUMS", sums)
    return manifest, archive_bytes, outer.getvalue()


class PullReleaseTests(unittest.TestCase):
    def test_systemd_units_bound_runtime_and_preserve_recovery_window(self):
        deploy_dir = Path(__file__).parent
        pull_unit = (deploy_dir / "morndraft-oss-pull.service").read_text(encoding="utf-8")
        rollback_unit = (deploy_dir / "morndraft-oss-rollback@.service").read_text(encoding="utf-8")

        self.assertIn("UMask=0027\n", pull_unit)
        self.assertIn("TimeoutStartSec=15min\n", pull_unit)
        self.assertIn("TimeoutStopSec=30s\n", pull_unit)
        self.assertIn("TimeoutStartSec=90s\n", rollback_unit)
        self.assertIn("TimeoutStopSec=30s\n", rollback_unit)

    def test_progress_log_is_prefixed_and_flushed(self):
        with patch("builtins.print") as print_mock:
            pull.log("checking release metadata")

        print_mock.assert_called_once_with(
            "[morndraft-oss-pull] checking release metadata",
            flush=True,
        )

    def test_nginx_static_surface_preserves_hsts_and_retires_all_admin_prefixes(self):
        nginx = (Path(__file__).parent / "nginx-morndraft-oss.conf").read_text(encoding="utf-8")

        self.assertIn(
            'add_header Strict-Transport-Security "max-age=15552000; includeSubDomains" always;',
            nginx,
        )
        self.assertIn("location ^~ /admin {\n        return 404;\n    }", nginx)
        self.assertNotIn("proxy_pass", nginx)

    def test_stage_progress_is_ordered_and_does_not_log_credentials_or_signed_urls(self):
        run = {"id": RUN_ID, "head_sha": SOURCE_SHA}
        signed_url = "https://api.github.com/artifact?sig=DO_NOT_LOG"
        artifact = {"id": 99, "size_in_bytes": 8, "archive_download_url": signed_url}
        manifest = {"sourceSha": SOURCE_SHA}
        args = SimpleNamespace(rollback=None, stage_only=True, health_url="https://morndraft.com/")

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            releases = root / "releases"
            state = root / "state"
            releases.mkdir()
            state.mkdir()
            client = Mock()
            client.download.side_effect = lambda _url, destination: destination.write_bytes(b"artifact")
            output = io.StringIO()
            with (
                contextlib.redirect_stdout(output),
                patch.object(pull, "read_credential", return_value="DO_NOT_LOG_TOKEN"),
                patch.object(pull, "GitHubClient", return_value=client),
                patch.object(pull, "find_current_successful_run", return_value=run),
                patch.object(pull, "find_release_artifact", return_value=(artifact, "0" * 64)),
                patch.object(pull, "validate_artifact_zip", return_value=(manifest, b"archive")),
                patch.object(pull, "stage_release", return_value=releases / SOURCE_SHA),
            ):
                pull.deploy_locked(
                    args,
                    releases_dir=releases,
                    state_dir=state,
                    current_link=root / "current",
                )

            progress = output.getvalue()
            phases = (
                "checking the current main release workflow",
                f"selected {SOURCE_SHA} from workflow run {RUN_ID}",
                "checking the exact-SHA release artifact metadata",
                "downloading artifact 99 (8 bytes)",
                "downloaded 8 bytes; verifying release contents",
                f"verified {SOURCE_SHA}; staging the release directory",
                f"staged {SOURCE_SHA} without switching current",
            )
            offsets = [progress.index(phase) for phase in phases]
            self.assertEqual(offsets, sorted(offsets))
            self.assertNotIn("DO_NOT_LOG_TOKEN", progress)
            self.assertNotIn(signed_url, progress)
            self.assertNotIn("DO_NOT_LOG", progress)

    def test_download_interruption_leaves_no_live_or_staged_state(self):
        run = {"id": RUN_ID, "head_sha": SOURCE_SHA}
        artifact = {
            "id": 99,
            "size_in_bytes": 8,
            "archive_download_url": "https://api.github.com/artifact",
        }
        args = SimpleNamespace(rollback=None, stage_only=True, health_url="https://morndraft.com/")

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            releases = root / "releases"
            state = root / "state"
            releases.mkdir()
            state.mkdir()
            client = Mock()
            client.download.side_effect = pull.ReleaseError("Deployment interrupted by SIGTERM")
            with (
                contextlib.redirect_stdout(io.StringIO()),
                patch.object(pull, "read_credential", return_value="token"),
                patch.object(pull, "GitHubClient", return_value=client),
                patch.object(pull, "find_current_successful_run", return_value=run),
                patch.object(pull, "find_release_artifact", return_value=(artifact, "0" * 64)),
                self.assertRaisesRegex(pull.ReleaseError, "SIGTERM"),
            ):
                pull.deploy_locked(
                    args,
                    releases_dir=releases,
                    state_dir=state,
                    current_link=root / "current",
                )

            self.assertFalse((root / "current").exists())
            self.assertFalse((state / "deployed.json").exists())
            self.assertFalse((state / "failed-runs").exists())
            self.assertEqual(list(state.glob("morndraft-oss-artifact-*")), [])
            self.assertEqual(list(releases.iterdir()), [])

    def test_validates_and_extracts_every_manifest_file(self):
        files = {"assets/app.js": b"console.log('oss')\n", "index.html": b"<!doctype html>\n"}
        manifest, _, artifact_bytes = build_release(files)
        with tempfile.TemporaryDirectory() as temporary:
            artifact_path = Path(temporary) / "artifact.zip"
            artifact_path.write_bytes(artifact_bytes)
            validated, archive_bytes = pull.validate_artifact_zip(
                artifact_path,
                expected_digest=hashlib.sha256(artifact_bytes).hexdigest(),
                expected_run_id=RUN_ID,
                expected_sha=SOURCE_SHA,
            )
            self.assertEqual(validated, manifest)
            release_dir = Path(temporary) / "release"
            pull.extract_verified_tar(archive_bytes, validated, release_dir)
            self.assertEqual((release_dir / "index.html").read_bytes(), files["index.html"])
            pull.verify_release_directory(release_dir, validated)

    def test_static_directories_stay_public_under_restrictive_umask(self):
        files = {
            "assets/nested/app.js": b"console.log('oss')\n",
            "index.html": b"<!doctype html>\n",
        }
        manifest, archive_bytes, _ = build_release(files)
        with tempfile.TemporaryDirectory() as temporary:
            release_dir = Path(temporary) / "release"
            previous_umask = os.umask(0o027)
            try:
                pull.extract_verified_tar(archive_bytes, manifest, release_dir)
            finally:
                os.umask(previous_umask)

            directories = [release_dir, release_dir / "assets", release_dir / "assets" / "nested"]
            self.assertEqual(
                [stat.S_IMODE(path.stat().st_mode) for path in directories],
                [0o755, 0o755, 0o755],
            )

    def test_existing_verified_release_repairs_old_directory_modes(self):
        files = {
            "assets/nested/app.js": b"console.log('oss')\n",
            "index.html": b"<!doctype html>\n",
        }
        manifest, archive_bytes, _ = build_release(files)
        with tempfile.TemporaryDirectory() as temporary:
            releases = Path(temporary) / "releases"
            releases.mkdir()
            release_dir = releases / SOURCE_SHA
            pull.extract_verified_tar(archive_bytes, manifest, release_dir)
            directories = [release_dir, release_dir / "assets", release_dir / "assets" / "nested"]
            for path in directories:
                path.chmod(0o750)

            self.assertEqual(pull.stage_release(releases, manifest, archive_bytes), release_dir)
            self.assertEqual(
                [stat.S_IMODE(path.stat().st_mode) for path in directories],
                [0o755, 0o755, 0o755],
            )

    def test_rejects_outer_zip_path_traversal(self):
        with tempfile.TemporaryDirectory() as temporary:
            artifact_path = Path(temporary) / "artifact.zip"
            with zipfile.ZipFile(artifact_path, mode="w") as artifact:
                artifact.writestr("../release-manifest.json", b"{}")
                artifact.writestr("SHA256SUMS", b"x")
                artifact.writestr("archive.tar.gz", b"x")
            with self.assertRaisesRegex(pull.ReleaseError, "Unsafe archive path"):
                pull.validate_artifact_zip(
                    artifact_path,
                    expected_digest=pull.sha256_file(artifact_path),
                    expected_run_id=RUN_ID,
                    expected_sha=SOURCE_SHA,
                )

    def test_rejects_tar_symbolic_links(self):
        files = {"index.html": b"<!doctype html>\n"}
        manifest, archive_bytes, _ = build_release(files)
        original = io.BytesIO(archive_bytes)
        malicious = io.BytesIO()
        with tarfile.open(fileobj=original, mode="r:gz") as source, tarfile.open(fileobj=malicious, mode="w:gz") as target:
            for member in source.getmembers():
                target.addfile(member, source.extractfile(member) if member.isreg() else None)
            link = tarfile.TarInfo("site/escape")
            link.type = tarfile.SYMTYPE
            link.linkname = "../../outside"
            link.mode = stat.S_IFLNK | 0o777
            target.addfile(link)
        with self.assertRaisesRegex(pull.ReleaseError, "link or special file"):
            pull.inspect_tar(malicious.getvalue(), manifest)

    def test_rejects_tar_before_crossing_the_decompression_budget(self):
        manifest, archive_bytes, _ = build_release({"index.html": b"x" * 65_536})
        with patch.object(pull, "MAX_TAR_STREAM_BYTES", 1_024):
            with self.assertRaisesRegex(pull.ReleaseError, "decompression budget"):
                pull.inspect_tar(archive_bytes, manifest)

    def test_atomic_switch_keeps_the_previous_exact_sha(self):
        second_sha = "abcdef1234567890abcdef1234567890abcdef12"
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "releases" / SOURCE_SHA).mkdir(parents=True)
            (root / "releases" / second_sha).mkdir(parents=True)
            current = root / "current"
            self.assertIsNone(pull.atomic_switch(current, SOURCE_SHA))
            self.assertEqual(pull.read_current_sha(current), SOURCE_SHA)
            self.assertEqual(pull.atomic_switch(current, second_sha), SOURCE_SHA)
            self.assertEqual(pull.read_current_sha(current), second_sha)

    def test_current_link_must_stay_inside_the_release_root(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            current = root / "current"
            current.symlink_to(f"/tmp/{SOURCE_SHA}")
            with self.assertRaisesRegex(pull.ReleaseError, "releases/<exact-sha>"):
                pull.read_current_sha(current)

    def test_failed_first_switch_removes_current_link(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "releases" / SOURCE_SHA).mkdir(parents=True)
            current = root / "current"
            with patch.object(pull, "verify_health", side_effect=pull.ReleaseError("offline")):
                with self.assertRaisesRegex(pull.LiveVerificationError, "offline"):
                    pull.switch_and_verify(
                        current,
                        SOURCE_SHA,
                        "https://morndraft.com/",
                        "0" * 64,
                    )
            self.assertFalse(current.exists())
            self.assertFalse(current.is_symlink())

    def test_failed_switch_restores_previous_release(self):
        previous_sha = "abcdef1234567890abcdef1234567890abcdef12"
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "releases" / SOURCE_SHA).mkdir(parents=True)
            (root / "releases" / previous_sha).mkdir(parents=True)
            current = root / "current"
            current.symlink_to(f"releases/{previous_sha}")
            with patch.object(pull, "verify_health", side_effect=pull.ReleaseError("mismatch")):
                with self.assertRaisesRegex(pull.LiveVerificationError, "mismatch"):
                    pull.switch_and_verify(
                        current,
                        SOURCE_SHA,
                        "https://morndraft.com/",
                        "0" * 64,
                    )
            self.assertEqual(pull.read_current_sha(current), previous_sha)

    def test_interruption_after_replace_restores_previous_release(self):
        previous_sha = "abcdef1234567890abcdef1234567890abcdef12"
        real_atomic_switch = pull.atomic_switch
        calls = 0

        def switch_then_interrupt(current_link, source_sha):
            nonlocal calls
            calls += 1
            previous = real_atomic_switch(current_link, source_sha)
            if calls == 1:
                raise pull.ReleaseError("Deployment interrupted by SIGTERM")
            return previous

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "releases" / SOURCE_SHA).mkdir(parents=True)
            (root / "releases" / previous_sha).mkdir(parents=True)
            current = root / "current"
            current.symlink_to(f"releases/{previous_sha}")
            with patch.object(pull, "atomic_switch", side_effect=switch_then_interrupt):
                with self.assertRaisesRegex(pull.LiveVerificationError, "SIGTERM"):
                    pull.switch_and_verify(
                        current,
                        SOURCE_SHA,
                        "https://morndraft.com/",
                        "0" * 64,
                    )
            self.assertEqual(pull.read_current_sha(current), previous_sha)

    def test_local_switch_error_before_activation_is_not_live_failure(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "releases" / SOURCE_SHA).mkdir(parents=True)
            current = root / "current"
            current.symlink_to(f"releases/{SOURCE_SHA}")
            with patch.object(pull, "atomic_switch", side_effect=OSError("permission denied")):
                with self.assertRaisesRegex(OSError, "permission denied"):
                    pull.switch_and_verify(
                        current,
                        SOURCE_SHA,
                        "https://morndraft.com/",
                        "0" * 64,
                    )
            self.assertEqual(pull.read_current_sha(current), SOURCE_SHA)

    def test_cleanup_keeps_exactly_five_releases_including_current(self):
        with tempfile.TemporaryDirectory() as temporary:
            releases = Path(temporary) / "releases"
            releases.mkdir()
            shas = [f"{index:040x}" for index in range(1, 8)]
            for run_id, source_sha in enumerate(shas, start=1):
                release = releases / source_sha
                release.mkdir()
                (release / ".release-manifest.json").write_text(
                    json.dumps({"workflowRunId": run_id}),
                    encoding="utf-8",
                )
            current_sha = shas[0]
            pull.cleanup_releases(releases, current_sha, keep=5)
            retained = sorted(path.name for path in releases.iterdir())
            self.assertEqual(len(retained), 5)
            self.assertIn(current_sha, retained)

    def test_deployment_lock_prevents_pull_and_rollback_overlap(self):
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary)
            with pull.deployment_lock(state):
                with self.assertRaisesRegex(pull.ReleaseError, "already running"):
                    with pull.deployment_lock(state):
                        self.fail("The second deployment lock must never be acquired")

    def test_manual_rollback_marks_the_outgoing_run_failed(self):
        target_sha = SOURCE_SHA
        outgoing_sha = "abcdef1234567890abcdef1234567890abcdef12"
        files = {"index.html": b"<!doctype html>\n"}
        target_manifest, target_archive, _ = build_release(
            files,
            source_sha=target_sha,
            run_id=RUN_ID,
        )
        outgoing_manifest, outgoing_archive, _ = build_release(
            files,
            source_sha=outgoing_sha,
            run_id=RUN_ID + 1,
        )
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            releases = root / "releases"
            state = root / "state"
            releases.mkdir()
            state.mkdir()
            pull.extract_verified_tar(target_archive, target_manifest, releases / target_sha)
            pull.extract_verified_tar(outgoing_archive, outgoing_manifest, releases / outgoing_sha)
            current = root / "current"
            current.symlink_to(f"releases/{outgoing_sha}")

            with patch.object(pull, "verify_health", return_value=None):
                pull.rollback_release(
                    current_link=current,
                    releases_dir=releases,
                    state_dir=state,
                    source_sha=target_sha,
                    health_url="https://morndraft.com/",
                )

            self.assertEqual(pull.read_current_sha(current), target_sha)
            failed = json.loads((state / "failed-runs" / f"{RUN_ID + 1}.json").read_text())
            self.assertEqual(failed["reason"], "manual-rollback")
            self.assertEqual(failed["rolledBackTo"], target_sha)
            deployed = json.loads((state / "deployed.json").read_text())
            self.assertEqual(deployed["workflowRunId"], RUN_ID)


if __name__ == "__main__":
    unittest.main()
