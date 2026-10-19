# Rshwub Meet deployment

This runbook targets one **Linode Shared CPU 4 GB / 2 vCPU server in Dallas**, with a fresh personal Openship instance at `deploy.rshwub.com` and the app at `meet.rshwub.com`. It does not change the existing work Openship instance. No infrastructure is provisioned by these files.

Budget selected for this project: **$24/month server + $5/month Linode Backups = $29/month**, before tax, optional email usage, and off-host object storage. Recheck the provider checkout before purchase. Resend and Cloudflare R2 have usage-based allowances/pricing; do not treat them as permanently free. One machine is a deliberate availability tradeoff: host maintenance, resource exhaustion, or an edge failure can affect all its apps. Backups enable recovery, not high availability.

## Deployment contract

- Build `apps/web/Dockerfile` in GitHub Actions using BuildKit, Node 24, `SELF_HOSTED=true`, and Linux amd64. Deploy the resulting **digest**, not `latest`.
- Run one `web` process and a private PostgreSQL 18 container with its own named volume. No public database port and no shared database credentials between future apps.
- Keep `RATE_LIMIT_ENABLED=true`. Upstream `apps/web/src/lib/rate-limit/index.ts`, API middleware and auth support memory limits when `KV_REST_API_*` is absent. Counters reset when the web process restarts and are not shared between replicas. Add a shared Upstash-compatible backend before scaling beyond one replica; do not disable limits to fix deployment problems.
- S3 is optional for image uploads. The initial app omits `S3_*`, so uploads are disabled. Polls and votes live in PostgreSQL. Optional uploaded assets need a separate private R2 bucket, dedicated credentials and a separate backup policy; database dumps do not include objects.
- Preserve Rallly's AGPL license and attribution. Make the fork's complete corresponding source available to network users, with a visible source link to [this repository](https://github.com/GrantWasil/rshwub-meet) and the deployed revision. Keep this repository public, or provide an equally accessible source archive. A private GitHub Actions artifact alone does not provide public source access.

## 1. Prepare the personal server

1. Provision the selected plan in Dallas with Ubuntu LTS, your personal SSH public key, and Linode Backups enabled. Record the server ID/IP and account recovery information in your password manager. Do not reuse work-instance secrets.
2. Update the fresh OS. Enable the provider firewall: SSH only from your trusted management IP/VPN; HTTP/HTTPS for web ingress. Do not open 3000, 3100, 4000, 5432 or other internal service ports publicly. Keep IPv6 firewall rules consistent if using IPv6. Provider-level filtering matters because Docker-published ports can bypass host UFW rules.
3. Install Docker Engine with Compose and Buildx using [Docker's Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/). Configure bounded Docker logs on this fresh host (for example the `local` driver, or `json-file` with `max-size=10m`, `max-file=3`), preserving any existing daemon settings.
4. Install a pinned Openship release from [the installation guide](https://openship.io/docs/getting-started/installation). Version 0.9.3 was the latest release checked on October 19, 2026; review current release notes before choosing the pin. Use the guided `openship` setup on Linux with Docker so it provisions the supported Compose stack and its host-control channel. Do not run the repository-root `docker-compose.yml`, which is a different stack. The personal control-plane database, credentials and backups must be independent of the work instance.
5. Use a strong unique admin login and MFA. Connect only the personal `GrantWasil/rshwub-meet` repository and required credentials. Treat dashboard/SSH/Docker access as host administration access.

The full Openship stack includes its own PostgreSQL, Redis, API, dashboard and edge. Our application database is separate. Builds stay in GitHub Actions so they do not compete with these services on the 4 GB server. Start with only this app; measure actual memory/disk use before adding more. Upgrade if normal memory use is persistently above roughly 75% or the host swaps under routine load.

## 2. Domains and HTTPS

In the personal Cloudflare account owning `rshwub.com`:

1. Add `deploy` and `meet` DNS records pointing to this server. Add an AAAA record only if IPv6 is configured and reachable. Do not alter unrelated subdomains.
2. Configure `deploy.rshwub.com` during Openship setup and `meet.rshwub.com` on the application's web service. Openship manages the edge and certificates. Follow its [domain guide](https://openship.io/docs/guides/custom-domains); if using HTTP certificate validation, ensure its challenge path reaches the origin.
3. For ordinary Cloudflare proxying, enable **Full (strict)** only with a valid origin certificate. Do not use Flexible SSL. Alternatively, Openship supports [Cloudflare Tunnel ingress](https://openship.io/docs/guides/cloudflare-tunnel), which needs separate setup and scoped permissions. Choose one ingress method and verify it end to end.
4. Protect `deploy.rshwub.com` with Cloudflare Access restricted to your personal identity. Leave `meet.rshwub.com` public so guests can create and vote. This workflow publishes images but does not need a public deployment webhook. If adding automatic deploys later, explicitly arrange authenticated webhook access without bypassing protection for the whole dashboard.
5. Verify that the edge overwrites/trusts forwarding headers correctly for Cloudflare, and that app rate-limit keys use the actual visitor IP. Follow the [trusted proxy guidance](https://openship.io/docs/guides/the-edge). Test two independent clients and an untrusted supplied forwarding header; saving proxy settings alone is not verification.

Keep DNS tokens scoped to this zone; add tunnel/access permissions only if those features are used. Keep cookies scoped to `meet.rshwub.com` (leave `NEXT_PUBLIC_COOKIE_DOMAIN` unset).

## 3. Resend email

Verify the sending domain in Resend using its supplied DNS records. A dedicated sending subdomain is fine, but `NOREPLY_EMAIL` must belong to the domain actually verified. Set `SUPPORT_EMAIL` to a real monitored mailbox; Resend sending does not create an inbox.

The manifest uses `smtp.resend.com`, user `resend`, and a sending API key as `SMTP_PWD`, with **implicit TLS on port 2465** and certificate validation enabled. Resend [documents this alternate SMTP port](https://resend.com/docs/send-with-smtp); test connectivity from the chosen VPS before launch. Do not enable SMTP debug logging, which may expose the authentication exchange.

After deployment, verify receipt of an actual sign-in code at an external mailbox and check Resend's delivery result. A healthy web container does not prove email works. Record the sending quota and configure provider usage alerts.

## 4. Publish and configure the application

The [image workflow](../.github/workflows/rshwub-image.yml) runs on `main`, the fork's `rshwub-meet` branch, `meet-v*` tags, or manual dispatch in `GrantWasil/rshwub-meet`. It uses pinned action commits and publishes `ghcr.io/grantwasil/rshwub-meet:sha-<commit>`, an SBOM/provenance record, and a matching source artifact. It does not deploy or change DNS. The upstream Dockerfile has moving base/dependency references; digest-pinning the published result makes deployment reproducible, not the entire build toolchain.

1. Run the workflow and copy the `ghcr.io/grantwasil/rshwub-meet@sha256:…` reference from the run summary. Make the GHCR package public, or give Openship a read-only package credential. Confirm the OCI revision matches the reviewed commit.
2. Resolve a reviewed PostgreSQL 18 image to its digest on a trusted machine. For example, pull `postgres:18-alpine`, then run `docker image inspect postgres:18-alpine --format '{{index .RepoDigests 0}}'`. Record the resolved version and digest; refresh it deliberately for security updates.
3. In this checkout, generate and edit the private env file:

   ```sh
   python3 scripts/rshwub-init-env.py
   # Fill in image digests, Resend key, and email addresses in deploy/.env.
   python3 scripts/rshwub-validate-env.py
   docker compose --env-file deploy/.env -f deploy/docker-compose.yml config --quiet
   ```

   The generator refuses to overwrite a file and prints no secrets. Store a protected copy in your password manager, including `SECRET_PASSWORD` (needed for sessions), database credentials and the maintenance token. Never print resolved Compose config in shared logs: it contains secrets. Do not copy actual env files or backup identities into container build contexts.

4. In the personal Openship instance, import the repository and choose Compose file `deploy/docker-compose.yml`. Set each interpolation variable from `deploy/.env` in the project's secret/environment controls **before scanning/deploying**, then verify the resolved service environments privately. If the importer cannot resolve an expression, enter that service's concrete value in the environment editor. Do not assume saving an env file on your laptop transfers it to Openship.
5. Use the imported image services; do not enable source builds or replace the image with a framework-detected build. Select the private `db` service and the public `web` service; map `meet.rshwub.com` to web port 3000.
6. Apply resource limits explicitly in Openship: web **1 GiB / 1 CPU**, database **768 MiB / 0.75 CPU**, one replica each. The `mem_limit`, `cpus`, and logging entries in our file protect native Docker Compose usage, but Openship's [documented importer](https://openship.io/docs/guides/compose-multi-service) models only a subset of Compose fields. Confirm the real container limits with `docker stats --no-stream` and `docker inspect`, and ensure log rotation is active. There is remaining headroom for Openship/OS; this is not a measured capacity guarantee.
7. Verify web's host port binds to `127.0.0.1`, not `0.0.0.0` or `[::]`. Native Compose uses `127.0.0.1:3100:3000`; Openship may manage its own loopback allocation. Confirm the actual binding and edge upstream agree. Database `PortBindings` must be absent/empty; never add a public database endpoint to fix service discovery.

Openship imports the named volume and service startup order. Startup order is **not a readiness guarantee**. The application runs Prisma migrations at startup; if Postgres is not ready, it exits and the restart policy retries. Verify migration success and both health states before switching traffic. Use a stable project/service identity so redeploys reuse the existing database volume. Never run `docker compose down --volumes` against production.

Optional R2 assets: add `S3_BUCKET_NAME`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_REGION=auto` only after creating a separate private assets bucket. Do not set an empty `S3_ENDPOINT` (URL validation rejects it). Leave the CDN variable unset initially so the app proxies assets. Test uploads and make a separate object backup plan before enabling them for users.

## 5. Independent encrypted database backups

Linode Backups are useful whole-machine recovery points; add daily logical PostgreSQL backups to a separate account/provider destination. The included systemd timer works without the Openship scheduler. It uses `pg_dump`'s consistent snapshot, encrypts directly to age, uploads to S3/R2, and verifies object size. No plaintext database dump is written to the server. It does not back up the Openship control plane, optional asset objects, or deployment secrets.

On a trusted local machine with age installed, generate an encryption identity:

```sh
age-keygen -o rshwub-backup-identity.key
age-keygen -y rshwub-backup-identity.key
```

Save the private identity in your password manager/offline recovery storage. Put only the public `age1…` recipient on the VPS. Losing the private identity makes backups unrecoverable. Do not commit it or place it in this source tree.

Create a private R2/S3 backup bucket. Restrict credentials to that bucket with object upload/read permissions; set a lifecycle expiration of 30–90 days according to your recovery needs. Separate backup credentials from application asset credentials. The script never prunes backups itself. For stronger protection against host compromise, use a bucket supporting retention/object lock and credentials that cannot bypass it.

On the VPS, install `age`, the AWS CLI, and the checked-in scripts under `/opt/rshwub-meet`. Determine the actual persistent database volume name in Openship service details or `docker inspect`. The backup selects the one running container mounting that volume, so ordinary container replacement does not require changing a container ID. It fails if zero or multiple running containers match.

```sh
sudo install -d -m 755 /opt/rshwub-meet/scripts
sudo install -m 755 scripts/rshwub-backup.sh /opt/rshwub-meet/scripts/
sudo install -d -m 700 /etc/rshwub-meet
sudo install -m 600 deploy/backup.env.example /etc/rshwub-meet/backup.env
# Fill in the root-owned backup.env with the actual volume, R2/S3 settings,
# restricted access credentials and PUBLIC age recipient. Do not source it.
sudo install -m 644 deploy/rshwub-meet-backup.service /etc/systemd/system/
sudo install -m 644 deploy/rshwub-meet-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start rshwub-meet-backup.service
sudo journalctl -u rshwub-meet-backup.service -n 30 --no-pager
# Enable only after the first backup and restore check succeed.
sudo systemctl enable --now rshwub-meet-backup.timer
```

The schedule is 09:15 UTC daily (03:15 Colorado daylight time / 02:15 standard time), plus up to 10 minutes of jitter. Check `systemctl list-timers` and the most recent object. Configure an external alert for backup failure or no fresh successful backup within 26 hours; a timer being active is not evidence of recovery readiness. Also back up Openship configuration/credentials using its supported instance backup/migration tools and store the recovery secret securely.

## 6. Restore drill and recovery

At launch and after schema/storage changes, download one encrypted object and its `.sha256` companion from the backup bucket to a trusted recovery machine. Check the checksum (`sha256sum -c <file>.sha256`, or `shasum -a 256 -c` on macOS), then run:

```sh
AGE_IDENTITY_FILE=/secure/path/rshwub-backup-identity.key \
RESTORE_POSTGRES_IMAGE='postgres@sha256:<recorded-digest>' \
  scripts/rshwub-restore-check.sh /secure/path/<timestamp>.dump.age
```

The script creates an isolated temporary database with no published ports, restores with `--exit-on-error`, checks that application tables exist, and removes the container and temporary volume. It needs Docker, age, OpenSSL and about 1 GiB of spare RAM plus disk for the restored database. Prefer your recovery machine over the already-loaded 4 GB production host. This verifies archive readability and restore, not every application invariant. Separately start the matching app image against a restored staging database and check a known poll, participant responses, comments and optional account login. Do not send real user mail from staging.

For real recovery:

1. Put the public app into maintenance mode and stop its web service after traffic drains. Save the current database volume/snapshot for investigation; do not erase it.
2. Create a **new** PostgreSQL 18 service/volume, with a new password and no public port. Restore the selected archive into its empty `rallly` database using the same `age --decrypt | docker exec -i <new-db> pg_restore --no-owner --no-acl --exit-on-error -U rallly -d rallly` pipeline. Match the database image and schema/application revision recorded for the backup.
3. Point a staging instance of the matching app image at the new database and verify representative data. Keep outbound email disabled at the network/provider boundary during this check.
4. Repoint production `DATABASE_URL` to the restored database, deploy the matching image, and verify migrations/health. Turn off maintenance only after the public checks pass. Keep the old database/snapshot until recovery is accepted.

Never assume an application-image rollback reverses Prisma migrations. Before updates, trigger and verify an independent backup; record the old and new image digests and review migration compatibility. If the old app cannot read the new schema, recovery requires a compatible forward fix or a separate database restore with an explicit decision about post-backup data loss.

## Launch evidence

Record the reviewed commit, image digests, Openship version, server ID, database volume, and backup timestamp without secrets. Confirm:

- HTTPS and redirects work on the exact public hostname; the admin hostname requires both the intended Access policy and Openship authentication.
- Public creation, private management link, guest voting/editing, both scheduling modes, mobile drag, timezone/DST handling, comments, finalizing and calendar export work.
- Optional email sign-in arrives at an external mailbox; a fresh session does not gain organizer privileges without its management link.
- App/database health and actual resource bounds pass, internal ports are unreachable externally, client-IP handling is correct, and rate limits remain enabled.
- A restart/redeploy retains a known poll and votes, the scheduled backup completes, and the latest encrypted backup restores successfully.
- Source attribution resolves to the deployed fork revision, and recovery secrets are stored outside the VPS.

Local syntax/config validation is not a live deployment check. The image workflow, provider connectivity, Openship import, TLS/email delivery, resource use and restore drill must be verified on the configured systems before calling this deployed.
