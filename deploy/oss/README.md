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

Inspect `/srv/morndraft-static/releases/<sha>`, confirm every static directory is mode `0755`, point a temporary Nginx server at that exact directory, and complete browser acceptance. Before reloading the main Nginx configuration, create `current` as a strict relative link to that already verified exact-SHA directory. Preparing the link first prevents the new Nginx root from ever pointing at a missing path during the initial cutover:

```bash
set -eu
release_sha="<40-character-sha>"
cutover_link="/srv/morndraft-static/.current.initial-$(cat /proc/sys/kernel/random/uuid)"
ln -s "releases/$release_sha" "$cutover_link"
test "$(readlink "$cutover_link")" = "releases/$release_sha"
mv -Tf "$cutover_link" /srv/morndraft-static/current
```

Use a fresh suffix for every attempt and stop if either `ln` or `readlink` fails; never move a temporary link left by an earlier attempt.

Then set `MORNDRAFT_STAGE_ONLY=0`, install and test `nginx-morndraft-oss.conf`, run the pull service once, and only then enable the timer. Before enabling the OSS site, move every enabled commercial MornDraft server block out of Nginx's active include paths while retaining a root-only rollback copy. There must be exactly one active `server_name morndraft.com` block: duplicate-name warnings are a cutover failure even when `nginx -t` exits successfully. The non-stage run intentionally revalidates GitHub and the artifact, verifies the live HTTPS body hash, and writes the deployment state:

```bash
printf '%s\n' 'MORNDRAFT_STAGE_ONLY=0' > /etc/morndraft-oss/pull.conf
nginx -t
systemctl reload nginx
systemctl start morndraft-oss-pull.service
```

Keep the reviewed commercial Nginx configuration available until that first non-stage health check and the live browser acceptance both pass. If either fails, restore that configuration and reload Nginx before investigating; the puller can roll back between retained static releases, but it does not manage the one-time commercial Nginx rollback. Enable the timer only after both gates pass:

```bash
systemctl enable --now morndraft-oss-pull.timer
```

The pull and rollback units turn `SIGTERM` and `SIGINT` into catchable deployment failures. Their explicit start timeouts therefore still restore the previous `current` link if systemd interrupts the process while post-switch health verification is pending.

The pull service allows up to 15 minutes for a verified Actions artifact to cross slow international links and emits bounded, non-secret progress markers for metadata lookup, download, verification, and staging. Individual API and socket operations still keep their shorter fail-closed timeouts.

The Nginx template intentionally has no upstream or API proxy. It serves only `morndraft.com`, returns `404` for retired application paths, treats hashed assets as immutable, keeps HTML uncached, and permits browser-side HTTPS OpenAI-compatible requests. It uses the current DigiCert paths during the first cutover. Only after Certbot issuance and `renew --dry-run` both succeed, switch the two directives to `/etc/letsencrypt/live/morndraft.com/fullchain.pem` and `/etc/letsencrypt/live/morndraft.com/privkey.pem`.

Rollback to the previously deployed SHA, or to a retained exact SHA:

```bash
systemctl start morndraft-oss-rollback@previous.service
systemctl start morndraft-oss-rollback@<40-character-sha>.service
```

The puller retains the five newest verified releases. A successful rollback is health-checked with the retained manifest before it becomes authoritative.

A successful manual rollback marks the outgoing workflow run under `state/failed-runs/`, so the 30-second timer cannot immediately redeploy it. A newer `main` SHA deploys normally. Re-enabling the same failed run requires a deliberate root-side investigation and removal of that exact run marker; never clear the entire failed-runs directory blindly.
