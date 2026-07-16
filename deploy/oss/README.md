# OSS production pull deployment

The public repository owns source and build provenance, but no production SSH key, vendor secret, server key, or long-lived deployment credential. GitHub builds a static artifact; the server pulls it with a fine-grained token restricted to this one public repository with **Actions: read** and **Contents: read** only. Contents read is needed solely to bind the release run to the current `main` SHA; the source is already public, and every write permission remains disabled.

## Trust and failure model

The puller fails closed unless all of these facts agree:

1. GitHub `main` points to the SHA of a successful `push` run of `oss-release.yml` in this repository.
2. That run owns exactly one non-expired artifact named `morndraft-oss-release-<sha>`.
3. The downloaded ZIP matches GitHub's artifact SHA-256 digest.
4. `SHA256SUMS`, `release-manifest.json`, the inner tar archive, and every static file agree on names, sizes, and SHA-256 digests.
5. The ZIP and tar contain no traversal path, duplicate path, symbolic/hard link, device, FIFO, encrypted member, or oversized expansion.
6. After an atomic `current` switch, the HTTPS response body for `index.html` matches the manifest digest.
7. Pull and rollback units share a non-blocking filesystem lock, so they cannot race the `current`, release-retention, or state files.

Automatic pulls mark a workflow run failed only when online verification fails; a successful manual rollback also marks the outgoing run. Both paths write `state/failed-runs/<run-id>.json`, so the timer cannot flap back to a rejected release. Network or GitHub API failures are retried later.

## One-time installation

Run as root after reviewing these files and before enabling the timer:

```bash
useradd --system --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin morndraft-release
install -d -o morndraft-release -g morndraft-release -m 0755 /srv/morndraft-static /srv/morndraft-static/releases
install -d -o morndraft-release -g morndraft-release -m 0750 /srv/morndraft-static/state
install -d -o root -g root -m 0755 /usr/local/libexec
install -o root -g root -m 0755 deploy/oss/morndraft_oss_pull.py /usr/local/libexec/morndraft-oss-pull
install -o root -g root -m 0644 deploy/oss/morndraft-oss-pull.service /etc/systemd/system/
install -o root -g root -m 0644 deploy/oss/morndraft-oss-pull.timer /etc/systemd/system/
install -o root -g root -m 0644 deploy/oss/morndraft-oss-rollback@.service /etc/systemd/system/
install -d -o root -g root -m 0755 /etc/morndraft-oss
install -d -o root -g root -m 0700 /etc/morndraft-oss/credentials
```

Create a fine-grained personal access token with access to this repository only, **Actions: read**, **Contents: read**, no write permission, and an explicit expiry. Enter it through a masked prompt; do not put it in a command, shell history, environment file, GitHub Secret, or repository:

```bash
install -o root -g root -m 0600 /dev/null /etc/morndraft-oss/credentials/github_token
systemd-ask-password "GitHub Actions-read token" > /etc/morndraft-oss/credentials/github_token
```

`LoadCredential=` copies this root-only file into a private, read-only service credential directory and exposes it only as `$CREDENTIALS_DIRECTORY/github_token`; it is never placed in the service environment. Token expiry safely stops future deployments without affecting the current static release. On a host that actually provides `systemd-creds`, the root file can optionally be replaced by a host-encrypted credential plus `LoadCredentialEncrypted=` after a separate compatibility check; the Ubuntu 22.04 baseline does not assume that optional command exists.

## Staging, cutover, rollback

Keep the timer disabled during the commercial-to-OSS cutover. Stage once with the same credential and sandbox as the service by temporarily adding `MORNDRAFT_STAGE_ONLY=1` to `/etc/morndraft-oss/pull.conf`, then run the service:

```bash
printf '%s\n' 'MORNDRAFT_STAGE_ONLY=1' > /etc/morndraft-oss/pull.conf
systemctl daemon-reload
systemctl start morndraft-oss-pull.service
```

Inspect `/srv/morndraft-static/releases/<sha>`, point a temporary Nginx server at that exact directory, and complete browser acceptance. Then set `MORNDRAFT_STAGE_ONLY=0`, install and test `nginx-morndraft-oss.conf`, run the pull service once, and only then enable the timer:

```bash
printf '%s\n' 'MORNDRAFT_STAGE_ONLY=0' > /etc/morndraft-oss/pull.conf
nginx -t
systemctl reload nginx
systemctl start morndraft-oss-pull.service
systemctl enable --now morndraft-oss-pull.timer
```

The Nginx template intentionally has no upstream or API proxy. It serves only `morndraft.com`, returns `404` for retired application paths, treats hashed assets as immutable, keeps HTML uncached, and permits browser-side HTTPS OpenAI-compatible requests. It uses the current DigiCert paths during the first cutover. Only after Certbot issuance and `renew --dry-run` both succeed, switch the two directives to `/etc/letsencrypt/live/morndraft.com/fullchain.pem` and `/etc/letsencrypt/live/morndraft.com/privkey.pem`.

Rollback to the previously deployed SHA, or to a retained exact SHA:

```bash
systemctl start morndraft-oss-rollback@previous.service
systemctl start morndraft-oss-rollback@<40-character-sha>.service
```

The puller retains the five newest verified releases. A successful rollback is health-checked with the retained manifest before it becomes authoritative.

A successful manual rollback marks the outgoing workflow run under `state/failed-runs/`, so the 30-second timer cannot immediately redeploy it. A newer `main` SHA deploys normally. Re-enabling the same failed run requires a deliberate root-side investigation and removal of that exact run marker; never clear the entire failed-runs directory blindly.
