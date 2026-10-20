# Rshwub Meet deployment

This runbook targets one **Linode Shared CPU 4 GB / 2 vCPU server in Dallas**, with a fresh personal Openship instance at `deploy.rshwub.com` and the app at `meet.rshwub.com`. It does not change the existing work Openship instance. These files describe the deployment; they do not provision infrastructure by themselves.

Budget selected for this project: **$24/month server + $5/month Linode Backups = $29/month**, before tax, optional email usage, and off-host object storage. Resend and Cloudflare R2 have usage-based allowances/pricing; do not treat them as permanently free. One machine is a deliberate availability tradeoff: host maintenance, resource exhaustion, or an edge failure can affect all its apps. Backups enable recovery, not high availability.

## Rollout status — October 20, 2026

**Meet is live at https://meet.rshwub.com.** Revision `f01c65cdc92b4c384425020b3bd8b964046bfc3a` is deployed; the public status endpoint returns HTTP 200 with the database connected. Availability defaults to a typical Monday–Sunday week with 30-minute slots, a compact overview with hourly labels, and an enlarged day editor on mobile; specific-date availability remains available. Classic and specific-date availability, organizer recovery, finalization/calendar export, web-restart persistence, and an isolated restore of a consistent production database snapshot passed the launch checks below. Passkey runtime and production HTTP checks pass; the owner confirmed real-device enrollment and sign-in, corroborated by the account's saved passkey and last login method. The owner has a verified personal account; its space Admin role is distinct from instance-wide administration. The launch Linode snapshot completed successfully. A database dump from the half-hour rollout remains on the production host, and its isolated restore passed. Independent encrypted off-host backups remain unconfigured.

| Item | Confirmed value or current state |
| --- | --- |
| Server | Linode `108605606`, label `rshwub-apps`, IPv4 `96.126.112.36`, Dallas |
| OS and size | Ubuntu 24.04.4 LTS; Shared CPU 4 GB / 2 vCPU |
| Provider backups | Linode Backups enabled; daily window 10:00–12:00 UTC; weekly backup day Sunday; manual launch snapshot confirmed **Success**, duration 5m 55s |
| Provider firewall | TCP 22 from `204.57.19.102/32`; TCP 80/443 from the 22 official Cloudflare IPv4/IPv6 ranges only |
| Personal deployment manager | Openship 0.9.3 installed and healthy; separate from the work instance |
| Public application | Proxied `meet` A record points to `96.126.112.36`; public HTTPS and `/api/status` verified |
| Deployment dashboard | `deploy.rshwub.com` through Cloudflare proxy; Access allow policy for `dev@grantwasil.com` only is active; Access challenge and owner Openship login verified |
| Origin TLS | Both hostname routes verified with Cloudflare Full (strict); manual Origin CA certificate has exactly these two SANs and expires October 15, 2041; private key stays on the host |
| Application | Compact weekly overview and mobile day editor revision `f01c65c` live; 159 finished migrations, none unfinished; web 1 GiB / 1 CPU, database 768 MiB / 0.75 CPU confirmed |
| Application image | `ghcr.io/grantwasil/rshwub-meet@sha256:9f82081660e4688ca813b696bd837b5211a4d8ef3d254ea90c5b3b86f1a97e6e`; OCI revision `f01c65cdc92b4c384425020b3bd8b964046bfc3a`; Linux amd64 |
| Database storage | Existing `openship-rshwub-meet-db-data` volume preserved; no public database ports |
| Recovery verification | Half-hour pre-release database dump retained on the production host, mode `0600`, 120,039 bytes; all 34 tables restored with matching row fingerprints; migration rehearsal preserved saved answers and unrelated data |
| Independent backup | Off-host encrypted database destination, credentials, timer, and retained-backup restore remain unconfigured/unverified |

The provider backup window is 04:00–06:00 Colorado daylight time or 03:00–05:00 standard time. Linode reports manual snapshot `rshwub-meet-launch-2026-10-19`, created at 23:44 UTC on October 19 (17:44 Colorado time), as **Success**, with a duration of **5m 55s**. This is a confirmed provider recovery point before the passkey migration. It does not establish that the first scheduled daily backup has completed or that a full-machine restore has been rehearsed.

## Deployment contract

- Build `apps/web/Dockerfile` in GitHub Actions using BuildKit, Node 24, `SELF_HOSTED=true`, and Linux amd64. Deploy the resulting **digest**, not `latest`.
- Run one `web` process and a private PostgreSQL 18 container with its own named volume. No public database port and no shared database credentials between future apps.
- Keep `RATE_LIMIT_ENABLED=true`. Upstream `apps/web/src/lib/rate-limit/index.ts`, API middleware and auth support memory limits when `KV_REST_API_*` is absent. Counters reset when the web process restarts and are not shared between replicas. Add a shared Upstash-compatible backend before scaling beyond one replica; do not disable limits to fix deployment problems.
- This deployment explicitly sets `TRUST_PROXY_X_REAL_IP=true`. Enable it only when the trusted edge **overwrites** `X-Real-IP` with the verified visitor address and direct application access is blocked. The Openship edge resolves `CF-Connecting-IP` only from trusted Cloudflare ranges and forwards that result in `X-Real-IP`; the app is reachable only on loopback. The app then ignores caller-supplied XFF chains and JA4 for quota identity, and Better Auth reads only `X-Real-IP`. Missing or malformed trusted headers share a fallback quota rather than falling back to untrusted headers. The flag defaults to false elsewhere and is rejected outside self-hosted mode.
- S3 is optional for image uploads. The initial app omits `S3_*`, so uploads are disabled. Polls and votes live in PostgreSQL. Optional uploaded assets need a separate private R2 bucket, dedicated credentials and a separate backup policy; database dumps do not include objects.
- Preserve Rallly's AGPL license and attribution. Make the fork's complete corresponding source available to network users, with a visible source link to [this repository](https://github.com/GrantWasil/rshwub-meet) and the deployed revision. Keep this repository public, or provide an equally accessible source archive. A private GitHub Actions artifact alone does not provide public source access.

## 1. Prepare the personal server

1. Use the existing server recorded above; do not provision a second machine. Keep account recovery information and SSH credentials in your password manager. Do not reuse work-instance secrets.
2. Update the fresh OS. Preserve the provider firewall: SSH only from the recorded management IP and HTTP/HTTPS only from [Cloudflare's official ranges](https://www.cloudflare.com/ips/). Review those ranges when Cloudflare changes them. If the management IP changes, update the SSH allowlist through the provider console before relying on the new connection. Do not open 3000, 3100, 4000, 5432 or other internal service ports publicly. Keep IPv6 firewall rules consistent if using IPv6. Provider-level filtering matters because Docker-published ports can bypass host UFW rules.
3. Install Docker Engine with Compose and Buildx using [Docker's Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/). Configure bounded Docker logs on this fresh host (for example the `local` driver, or `json-file` with `max-size=10m`, `max-file=3`), preserving any existing daemon settings.
4. Complete the pinned Openship 0.9.3 personal installation using [the installation guide](https://openship.io/docs/getting-started/installation). Use its supported Linux Docker stack and host-control channel. Do not run the repository-root `docker-compose.yml`, which is a different stack. The personal control-plane database, credentials and backups must be independent of the work instance. Review release notes deliberately before future upgrades.
5. Use a strong unique admin login and MFA. Connect only the personal `GrantWasil/rshwub-meet` repository and required credentials. Treat dashboard/SSH/Docker access as host administration access.

The full Openship stack includes its own PostgreSQL, Redis, API, dashboard and edge. Our application database is separate. Builds stay in GitHub Actions so they do not compete with these services on the 4 GB server. Start with only this app; measure actual memory/disk use before adding more. Upgrade if normal memory use is persistently above roughly 75% or the host swaps under routine load.

### Local deployment recovery

The deployment Mac reboot removed `/tmp/rshwub-meet-deploy`; the Linode kept running. Recovery material now lives at `~/.local/share/rshwub-meet-deploy` (directory mode `0700`): `known_hosts`, `openship-admin-password.txt` (mode `0600`), `03-openship-domains.py`, and `RECOVERY.md`. The Openship login was also saved in the owner's 1Password Private vault. Keep secrets out of this repository and shared output. Use the recorded SSH identity and pinned `known_hosts` with `StrictHostKeyChecking=yes`; do not routinely discard host pins or accept a changed key to reconnect. The helper runs on the VPS through its private control-plane connection.

Use durable protected storage for deployment credentials and host identity, and keep an encrypted recovery copy outside the deployment machine. `/tmp` is only scratch space. This local recovery directory does not constitute a database backup or a backup of the Openship control plane.

## 2. Domains and HTTPS

In the personal Cloudflare account owning `rshwub.com`:

1. Save proxied `deploy` and `meet` A records pointing to `96.126.112.36` only after their origin routes are ready. Add an AAAA record only if IPv6 is configured and reachable. Do not alter unrelated subdomains. Direct DNS-only ingress is incompatible with the Cloudflare-only origin firewall.
2. Configure `deploy.rshwub.com` during Openship setup and `meet.rshwub.com` on the application's web service. Openship manages the edge routing; this deployment supplies a **manual Cloudflare Origin CA certificate** for exactly these two hostnames. Generate and retain its private key on the host, submit only the CSR to Cloudflare, and install the returned public certificate with that key. Do not paste private keys into this repository, shared logs, or chat.
3. Enable **Full (strict)** once that origin certificate and both hostname routes validate. Keep Cloudflare proxying enabled: an Origin CA certificate is for the Cloudflare-to-origin connection, not direct browser trust. This topology uses neither Cloudflare Tunnel nor ACME issuance/renewal. Do not add an Access bypass for `/.well-known/acme-challenge/`; there is no ACME challenge in this flow.
4. Preserve the active Cloudflare Access application for `deploy.rshwub.com`, allowing only `dev@grantwasil.com`. After DNS activation, verify that an unauthenticated visitor is challenged and the intended owner can reach Openship login. Leave `meet.rshwub.com` outside that Access application so guests can create and vote. The image workflow does not need a public deployment webhook. If adding automatic deploys later, explicitly arrange authenticated webhook access without bypassing protection for the whole dashboard.
5. Verify that the edge overwrites/trusts forwarding headers correctly for Cloudflare, and that app rate-limit keys use the actual visitor IP. Follow the [trusted proxy guidance](https://openship.io/docs/guides/the-edge). Test two independent clients and an untrusted supplied forwarding header; saving proxy settings alone is not verification.

Keep DNS tokens scoped to this zone and add Access permissions only when needed. Keep cookies scoped to `meet.rshwub.com` (leave `NEXT_PUBLIC_COOKIE_DOMAIN` unset).

For Openship's own browser authentication, set `OPENSHIP_PUBLIC_URL=https://deploy.rshwub.com` in the **control-plane** `.env`. Browser login succeeded after adding this value and recreating the API and dashboard containers so both read it. Preserve it during upgrades and recovery; changing the app's `NEXT_PUBLIC_BASE_URL` does not configure Openship. Verify owner login through Cloudflare Access after a control-plane restart. This dashboard check does not establish that Meet is publicly deployed.

### Manual origin certificate installation and renewal

The following paths and behavior are confirmed for Openship 0.9.3; both public hostname routes and origin TLS were verified during launch:

- Host-side inputs: `/root/rshwub-deploy/tls/origin.key` (root-owned, mode `0600`), `/root/rshwub-deploy/tls/origin.csr` (public CSR), and `/root/rshwub-deploy/tls/origin-cert.pem` (signed public certificate).
- After the two domain routes exist, upload the same certificate/key pair for **each domain ID** with `openship domain upload-cert DOMAIN_ID --cert /root/rshwub-deploy/tls/origin-cert.pem --key /root/rshwub-deploy/tls/origin.key`, or its `POST /api/domains/:id/certificate` equivalent through the private control-plane connection. Use the actual domain IDs; do not substitute hostnames where an ID is expected.
- On the initial Meet deployment, attaching the app route after an earlier certificate upload left HTTPS inactive. Re-uploading the manual certificate after route attachment activated port 443. Preserve this ordering during recovery and verify the actual TLS listener; an already-populated certificate record alone is insufficient.
- Openship writes each domain's files on the resolved edge executor at `/etc/letsencrypt/live/<hostname>/fullchain.pem` and `privkey.pem`, sets the private key to `0600`, and activates/reloads that domain's existing route. The directory name does not imply ACME manages these files. The domain record should show `manualSsl: true`, `sslStatus: active`, issuer `manual`, and the correct expiration date.
- Record the actual certificate expiry and arrange an alert before it expires. Manual certificates are excluded from Openship's ACME issuance/renewal jobs; neither Cloudflare Access nor an Openship restart renews this certificate. Before expiry, generate a replacement CSR/key on the host or use the existing protected key, obtain a replacement Origin CA certificate with the same two SANs, then re-upload it for **both** domain IDs. Verify each live TLS route after reload before revoking any superseded certificate.
- Keep the private key on the host during provisioning and never expose it in command output. Include the installed certificate/key and domain configuration in protected encrypted recovery backups. After host loss, either restore those protected files or generate a new host-side key and issue a replacement certificate. An application database dump alone does not restore edge TLS.

Validate the public Cloudflare HTTPS endpoint and the origin certificate chain/hostname separately. A successful upload response or `sslStatus: active` is not sufficient launch evidence; Cloudflare must reach the origin using Full (strict), both public hostnames must route correctly, and only the deployment dashboard must require Access.

## 3. Resend email

Verify the sending domain in Resend using its supplied DNS records. A dedicated sending subdomain is fine, but `NOREPLY_EMAIL` must belong to the domain actually verified. Set `SUPPORT_EMAIL` to a real monitored mailbox; Resend sending does not create an inbox.

The manifest uses `smtp.resend.com`, user `resend`, and a sending API key as `SMTP_PWD`, with **implicit TLS on port 2465** and certificate validation enabled. Resend [documents this alternate SMTP port](https://resend.com/docs/send-with-smtp); test connectivity from the chosen VPS before launch. Do not enable SMTP debug logging, which may expose the authentication exchange.

After deployment, verify receipt of an actual sign-in code at an external mailbox and check Resend's delivery result. A healthy web container does not prove email works. Record the sending quota and configure provider usage alerts.

`INITIAL_ADMIN_EMAIL` remains configured as `dev@grantwasil.com`. A verified account with that address can visit `/admin-setup` to claim the instance administrator role. Other addresses cannot claim it through that flow. This is separate from the Openship administrator and from a space's membership role.

Resend reports the initial sign-in email `01a1568c-0366-76a5-80eb-f5251efe81fe` to `dev@grantwasil.com` as **DELIVERED**, sent using the restricted SMTP credential. The owner subsequently created a verified personal account using another address. Its **Members** screen correctly shows **Owner** and **Admin** for its space, while the instance-wide account role remains `user`. **Control Panel** requires the separate instance role `admin`. The owner chose to keep the current role; passkey enrollment does not require instance administrator privileges. No role or `INITIAL_ADMIN_EMAIL` change was made.

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

Linode Backups are enabled for whole-machine recovery points on the schedule recorded above. **Independent encrypted database backups are not yet configured.** Provider backups do not establish a second-provider copy, prove a PostgreSQL restore, or preserve recovery credentials outside the server. Complete the following setup before marking off-host recovery ready.

Add daily logical PostgreSQL backups to a separate account/provider destination. The included systemd timer works without the Openship scheduler. It uses `pg_dump`'s consistent snapshot, encrypts directly to age, uploads to S3/R2, and verifies object size. No plaintext database dump is written to the server. It does not back up the Openship control plane, optional asset objects, or deployment secrets.

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

A local rehearsal on October 19, 2026 successfully encrypted the isolated development database and restored all 33 public tables into disposable PostgreSQL 18 using `scripts/rshwub-restore-check.sh`. The disposable resources were removed and the development volume preserved. This verifies the local script/format path only; it is not a production backup, an off-host upload test, or a production restore drill. Its temporary age identity must not become the production backup identity.

The launch additionally tested the real production database: a consistent exported snapshot was dumped and restored into an isolated disposable database with no network and a 512 MiB memory limit. All 33 table counts matched, along with selected QA content (two polls, two options, two participants, two votes, and one comment). The disposable container and volume were removed. No archive was written or retained and no off-host backup was configured; this proves the tested snapshot could restore, not that there is a usable backup to recover from later. A production web restart separately preserved all selected QA fields.

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

## Compact weekly overview and mobile day editor — deployed and verified

Revision `f01c65cdc92b4c384425020b3bd8b964046bfc3a` is deployed as `ghcr.io/grantwasil/rshwub-meet@sha256:9f82081660e4688ca813b696bd837b5211a4d8ef3d254ea90c5b3b86f1a97e6e`, built by [workflow 39461591371](https://github.com/GrantWasil/rshwub-meet/actions/runs/39461591371), which succeeded at 17:01:11 UTC on October 20. Public health passed at 17:02:12 UTC and strict origin TLS at 17:02:13 UTC (11:02 Colorado time). The existing database container and mounts, runtime settings, and service environment were preserved. Both protected deployment env copies are synchronized and validated.

The overview fits seven weekday columns across the available width, with a shared 54-pixel time gutter, short weekday labels, 18-pixel half-hour rows, hourly labels, and an ending-time label. A 09:00–23:00 window uses 28 rows. Empty cells stay blank; selected-time details show exact counts, and tentative availability retains its question-mark cue. Specific-date polls retain visible converted-date markers when a viewer's time zone crosses a date boundary; polls with more than seven date columns can scroll horizontally. On narrow screens or coarse-pointer devices, tapping a day header or cell opens that day without changing answers. The day editor has 48-pixel rows, half-hour labels, previous/next-day controls, and an **All days** action. Touch scrolling remains the default; **Paint** enables dragging. Desktop rectangle selection and keyboard navigation remain available. There is no database migration or saved-data conversion.

Local validation passed 125 availability tests, TypeScript, and Biome. Tests cover day entry without accidental voting, Yes/Maybe/Clear selection, preserved values across day navigation, keyboard focus, cancelled and coalesced gestures, drag endpoints without a final pointermove, scrolling that must not become a tap, and converted-date visibility. Browser checks covered the actual component at 320 pixels in dark mode and 390 pixels in light mode. Native Chrome with iPhone 16 device emulation verified the actual application's mobile day editor, painting, Maybe, Clear, save, and reload persistence. These checks used browser emulation; physical-device finger behavior was not independently verified.

The exact release image passed the isolated full-runtime smoke test at 17:01:06 UTC: 159 finished migrations, 34 tables, authentication and login checks, and verified cleanup. Evidence is at `~/.local/share/rshwub-meet-deploy/image-smoke-f01c65cdc92b4c384425020b3bd8b964046bfc3a.json`. Production postflight at 17:02:17 UTC matched all seven stable table fingerprints against the 16:57:18 UTC baseline: 10 polls, 9 participants, 5 users, 2 votes, 2 options, 1 comment, and 1 passkey. Evidence is retained at `/root/rshwub-deploy/compact-week-before-f01c65c.json` and `/root/rshwub-deploy/compact-week-after-f01c65c.json`.

Live QA created **Compact full-week release verification** (`4lwRY-7h0NprPBLr2Kwgg`) with a typical 09:00–23:00 week in `America/Denver`. In Chrome's iPhone 16 emulation at 393 × 852 pixels, all seven days and the full fourteen-hour grid were visible with no horizontal overflow. Opening a day did not change answers. Paint selected all four Monday 09:00–11:00 slots; Maybe changed 09:30–10:00, and Clear removed 10:30–11:00. A swipe in Scroll mode and navigation to Tuesday and back preserved the answers. Save and reload retained Yes at 09:00–09:30 and 10:00–10:30, Maybe at 09:30–10:00, and no availability at 10:30–11:00. The database confirmed 60 Yes minutes and 30 Maybe minutes; tapping the 09:30 result showed 0 yes, 1 maybe, and 0 unavailable. The console had two logo-preload warnings and no errors. The exact QA poll was soft-deleted at 17:06:55 UTC, and a browser reload confirmed **Page not found**. The browser was restored to normal desktop mode on `/availability/new`. Evidence is retained at `/root/rshwub-deploy/compact-week-ui-f01c65c.json`. Final public health at 17:07:29 UTC confirmed the expected revision and connected database.

## Mobile grid refinement — deployed and verified

Revision `86833a989c32ad419adf69ed95db1c6aa42ce995` was deployed as `ghcr.io/grantwasil/rshwub-meet@sha256:0cac6259aca1e705b1f3bfce90d893d706a1c112e5b6c34f0b0d901981f9ee24`, built by [workflow 39360969785](https://github.com/GrantWasil/rshwub-meet/actions/runs/39360969785), which succeeded at 02:53:42 UTC on October 20. Public health passed at 02:55:04 UTC and strict origin TLS at 02:55:05 UTC (20:55 Colorado time on October 19). The existing database, environment, and runtime settings were preserved. Both protected deployment env copies were synchronized to that release; local validation passed.

That release decreased coarse-pointer rows from 44 to 40 pixels; desktop rows remained 32 pixels. Text, column width, and selection logic were unchanged. Replacing `overscroll-contain` with `overscroll-x-contain` let vertical scrolling continue onto the page. No migration or saved-data change was included: all seven stable table fingerprints matched the 02:52:19 UTC baseline, including 9 polls and 7 participants, with 159 finished migrations and none unfinished. Evidence is retained at `/root/rshwub-deploy/mobile-before-86833a9.json` and `/root/rshwub-deploy/mobile-after-86833a9.json`.

Local coarse-pointer emulation at a 390-pixel viewport showed aligned 40-pixel rows and time labels, 103-pixel buttons inside 104-pixel columns, and a 517-pixel grid with equal client and scroll heights and no page overflow. Mouse input verified single-cell selection and a rectangular drag through Tuesday's first three rows, leaving the fourth unselected. Vertical wheel input moved the page from 44 to 260 pixels instead of remaining trapped; horizontal scrolling from 0 to 480 pixels preserved answers. Console warnings and errors were empty. Twenty existing grid/layout tests, Biome, diff checks, and the Impeccable layout detector passed. The exact image passed full-runtime smoke verification at 02:54:15 UTC: 159 migrations, 34 tables, authentication and login checks, and verified cleanup. Evidence is at `~/.local/share/rshwub-meet-deploy/image-smoke-86833a989c32ad419adf69ed95db1c6aa42ce995.json`.

Live QA created **Mobile grid verification** (`tQ4GtaG633gW0ppHaRMWJ`) at a 390-pixel viewport with coarse-pointer emulation and mouse/wheel input. Both grids had 40-pixel rows and time labels, equal client and scroll heights of 517 pixels, no page overflow, and horizontal overscroll containment with vertical scrolling set to auto. Monday 19:00–19:30 Yes and 19:30–20:00 Maybe persisted after reload; the database confirmed one response containing 30 minutes of each. There were no visible zero-count labels or console errors. Scrolling over the grid moved the page heading from 20 to −106.5 pixels; disabling coarse-pointer emulation restored 32-pixel desktop rows. The exact QA poll was soft-deleted at 02:56:06 UTC, a reload confirmed **Page not found**, and all emulation was reset with the browser at 1280 pixels on `/availability/new`. Evidence is at `/root/rshwub-deploy/mobile-ui-86833a9.json`.

These checks used emulation and mouse/wheel input. Direct synthesized touch was unsupported, and mouse-to-touch emulation timed out; actual finger gestures and physical-device behavior remain unverified.

## Compact availability grid — deployed and verified

Revision `07503ef3a611eaf06f3c0b082f31ffc5a8a89e5c` was deployed as `ghcr.io/grantwasil/rshwub-meet@sha256:88ba611a777fe7b2d6dee05c3154e43edfab4925e8bce11a0d252be4c0076936`, built by [workflow 39359787144](https://github.com/GrantWasil/rshwub-meet/actions/runs/39359787144), which succeeded at 02:40:37 UTC on October 20. Public health passed at 02:42:16 UTC and strict origin TLS at 02:42:18 UTC (20:42 Colorado time on October 19). The rollout preserved the existing database, environment, and runtime settings. Both protected deployment env copies were synchronized to that release's digest; validation passed.

That release reduced desktop rows from 44 to 32 pixels, with an inherited CSS variable keeping time labels, placeholders, and cells aligned. It retained 44-pixel targets with `any-pointer: coarse` on touch-capable devices, including hybrids; the later mobile refinement reduced those targets to 40 pixels. Header padding decreased from 12 to 8 pixels, and date-shift badges used a 12-pixel line height. There was no migration or saved-data change: all seven stable table fingerprints matched the 02:40:16 UTC baseline, including 8 polls and 6 participants, with 159 finished migrations and none unfinished. Evidence is retained at `/root/rshwub-deploy/compact-before-07503ef.json` and `/root/rshwub-deploy/compact-after-07503ef.json`.

Local verification passed 103 availability tests across 12 files, Biome, the Impeccable layout detector, and diff checks. The dark desktop fixture showed 12 rows and 84 cells in a 421-pixel grid with equal client and scroll heights, down from 573 pixels of full content; the default 17:00–23:00 range fit without vertical scrolling. A 388-pixel light mobile iframe with touch emulation retained 44-pixel rows and labels, aligned uneven placeholders, and had no page overflow. Mouse selection and ArrowDown/Space worked; console warning and error logs were empty. Mobile verification remained local and emulated.

The exact image passed full-runtime smoke verification at 02:41:33 UTC: 159 migrations, 34 tables, none unfinished, authentication and login checks, no real credentials, and verified cleanup. Protected evidence is at `~/.local/share/rshwub-meet-deploy/image-smoke-07503ef3a611eaf06f3c0b082f31ffc5a8a89e5c.json`.

Live desktop QA created **Compact grid verification** (`XQv0dk848mI2INaXza_oX`). Both editor and results grids showed 12 rows, 84 cells, 32-pixel rows, and equal client and scroll heights of 421 pixels. A Monday 22:30–23:00 Yes response persisted after reload; a database check confirmed one 30-minute response. There were no visible 0/N labels or console errors. The exact QA poll was soft-deleted at 02:42:55 UTC, a browser reload confirmed **Page not found**, and `/availability/new` was restored. Evidence is at `/root/rshwub-deploy/compact-ui-07503ef.json`.

## Empty availability counts — deployed and verified

Revision `819eca368bd115cf481c2ad4e7d891ff6e63a46e` was deployed as `ghcr.io/grantwasil/rshwub-meet@sha256:e505deee8989ed96bd95f7eee88086d951a59edbabe2f3f3273eda6b9a93459e`, published by successful [workflow 39358539292](https://github.com/GrantWasil/rshwub-meet/actions/runs/39358539292). Public health passed at 02:31:18 UTC and strict origin TLS at 02:31:49 UTC on October 20 (20:31 Colorado time on October 19). The web-only rollout preserved the database container, environment, and runtime settings. Both protected deployment env copies were synchronized to that release's digest; local validation passed.

Result ratios appear only for positive Yes counts; maybe-only cells retain their question-mark count, and cells with neither response stay blank, including polls with zero participants. Accessible names, titles, selected-cell details, and editing controls retain their counts and behavior. The English legend explains that empty cells have no availability marked. No database migration was included. Postflight confirmed 159 finished migrations and none unfinished. Stable fingerprints for all pre-existing rows across seven application tables matched the 02:22:28 UTC baseline. Full-table hashes differed because two polls and one user were created afterward; comparison by creation timestamp excluded those new rows and verified preservation of the baseline records. Evidence is retained at `/root/rshwub-deploy/zero-count-before-819eca3.json` and `/root/rshwub-deploy/zero-count-after-819eca3.json`.

Validation passed 103 availability tests across 12 files, TypeScript, and Biome. Local fixtures confirmed a blank zero-response cell, a maybe-only count of 2, and a positive cell showing 3/5 plus 1 maybe; blank-cell details still reported 0 Yes, 0 Maybe, and 5 unavailable. An emulated mobile fixture showed 84 blank cells with page and viewport both 388 pixels wide; its console was empty. The exact image passed full-runtime smoke verification at 02:30:28 UTC: 159 migrations, 34 tables, no real credentials, and verified cleanup. Evidence is at `~/.local/share/rshwub-meet-deploy/image-smoke-819eca368bd115cf481c2ad4e7d891ff6e63a46e.json`.

Live desktop QA created **Zero count verification** (`cSKmJX6QVGnuJo8hR_rRk`), initially showing 84 blank result cells. After saving one 30-minute Yes slot and one 30-minute Maybe slot and reloading, it showed 82 blank cells, a 1/1 Yes count, a question-mark count of 1 for Maybe, and no visible 0/N ratios. Selecting a blank cell still reported 0 Yes, 0 Maybe, and 1 unavailable. Database values matched; browser warning and error counts were zero. The exact QA poll was soft-deleted at 02:32:50 UTC, a reload confirmed **Page not found**, and `/availability/new` was restored. Evidence is at `/root/rshwub-deploy/zero-count-ui-819eca3.json`. Mobile verification remained local and emulated.

## Shared time column — deployed and verified

Revision `8355013c0e94a39cfad25407cd0f4d98c25ff9ae` was deployed as `ghcr.io/grantwasil/rshwub-meet@sha256:5be9bf5e20b59dba75150431687cb9de548f5865541b98d00a105abc6cb8d1ef`, built by successful [workflow 39357051626](https://github.com/GrantWasil/rshwub-meet/actions/runs/39357051626). Production health and strict origin TLS passed at 02:14:07–08 UTC on October 20 (20:14 Colorado time on October 19). The database container and volume, web environment, resource limits, and loopback binding were preserved. Both protected deployment env copies were synchronized to that release's digest; local env validation passed.

Times appear once in a sticky left column, with centered votes and counts. Placeholders align rows across daylight-saving gaps, repeated hours, and viewer time-zone shifts; full accessible cell names remain available. Half-hour intervals and saved data are unchanged. There were no new migrations: postflight confirmed 159 finished, none unfinished, and unchanged stable fingerprints for seven application tables. Evidence is retained at `/root/rshwub-deploy/time-gutter-before-8355013.json` and `time-gutter-after-8355013.json` in the same directory.

Validation passed 103 availability tests across 12 files, TypeScript, and Biome; independent review found no blockers. The actual-component preview at 1280 pixels showed 12 time labels and 84 aligned cells without repeated visible times inside cells. Within a 390-pixel mobile frame, the iframe and page were 388 pixels wide; the 336-pixel grid scrolled 816 pixels of content. At the maximum horizontal offset of 480 pixels, the time column stayed one pixel inside the grid's left border, and selecting Sunday 17:00 marked Yes. Light desktop and dark mobile preview consoles were empty. The mobile checks were local and emulated.

The exact image passed the isolated full-runtime smoke test at 02:12:36 UTC on October 20: 159 migrations, 34 tables, zero users and passkeys, no real secrets, an internal-only network, and verified cleanup. Protected evidence is at `~/.local/share/rshwub-meet-deploy/image-smoke-8355013c0e94a39cfad25407cd0f4d98c25ff9ae.json`.

Live desktop browser QA created the disposable **Time column verification** poll (`ccNNA1WSvmCX7Mx63-3kq`). Both response and results grids had 12 time-column labels, 84 aligned cells, and no visible times repeated inside cells. Four Monday 17:00–19:00 selections persisted after reload; a database check confirmed the 120-minute saved response. The console was empty. The exact QA poll was soft-deleted, and a live browser reload confirmed **Page not found**. The creation form was restored ready for use. Evidence is at `/root/rshwub-deploy/time-gutter-ui-8355013.json`.

## Weekly availability and half-hour rollout — deployed and verified

Revision `88852a59b80a71df5e66d499b693716c3a603879` was deployed as `ghcr.io/grantwasil/rshwub-meet@sha256:2ca7398b48d5813ec69b25dedef3c71512ffe2d18433c89dbcace760392fbe03`, built by successful [workflow run 39355190469](https://github.com/GrantWasil/rshwub-meet/actions/runs/39355190469). Its OCI revision and Linux amd64 platform matched before deployment. Public health, reported revision, database connectivity, and strict origin TLS passed at 01:51:36 UTC on October 20 (19:51:36 Colorado time on October 19). The existing database container and volume, web environment, resource limits, and loopback binding were preserved. Both protected deployment env copies were updated to that release's digest.

New availability polls default to a typical Monday–Sunday week with no calendar dates. Everyone answers in the event's shared time zone, and results rank recurring windows of the chosen duration alongside the overlap grid. Weekly polls show weekdays and times; they do not offer dated finalization or calendar export. Specific-date availability remains optional, retaining its calendar, viewer time-zone conversion, finalization, and ICS export. Existing dated polls keep their mode and event duration; classic polls are unchanged.

That release introduced 30-minute cells, sticky day headings, 44-pixel targets, clearer response symbols and maybe counts, and improved keyboard/touch selection. The repository includes the project-local Impeccable skill used for this UI work.

That release applied three data migrations in order:

1. `20261020005900_normalize_unused_availability_windows` expands incompatible daily windows to half-hour boundaries only when there are no saved availability answers.
2. `20261020005930_preserve_archived_availability_answers` sets soft-deleted polls to 30-minute slots without rewriting historical answers, including partial 15-minute intervals. These polls remain inaccessible; any future restore flow must explicitly reconcile those partial answers.
3. `20261020010000_use_half_hour_availability_slots` updates remaining polls only after checking duration, daily-window, and saved-response compatibility. Incompatible active data stops the migration instead of being rounded.

Preflight passed for the exact revision. A production database dump is retained at `/root/rshwub-deploy/half-hour-before-88852a59b80a71df5e66d499b693716c3a603879.dump` (120,039 bytes, mode `0600`). An isolated restore matched strict row fingerprints for all 34 tables. The rehearsal preserved 3 polls, 2 participants, 2 options, 2 votes, 1 comment, 3 users, and 1 passkey. This is a retained same-host dump, not an encrypted off-host backup. Evidence is recorded at `/root/rshwub-deploy/half-hour-preflight-88852a59b80a71df5e66d499b693716c3a603879.json`.

Both existing availability polls were already soft-deleted. After migration, both had `slotMinutes=30`; the unanswered poll's 08:00–23:45 window became 08:00–24:00. That was the only daily-window change. The answered poll retained its 17:00–23:00 window, 60-minute event duration, and exact saved availability answers. Production postflight passed: all three migrations finished with the expected checksums, no migrations were unfinished, all availability polls used 30-minute slots, and stable-field fingerprints matched. Evidence is retained at `/root/rshwub-deploy/half-hour-postflight-88852a59b80a71df5e66d499b693716c3a603879.json`.

Local verification passed 95 tests across 11 files, TypeScript, and Biome. An actual local Next.js session created a weekly poll without selecting dates, saved Monday 17:00–19:00 availability, reloaded the response, and displayed the matching ranked two-hour window. At a 390-pixel viewport, page width remained 390 pixels while the 338-pixel grid viewport scrolled its 840-pixel content horizontally. These checks establish the local flow and emulated viewport layout; they do not establish physical-device touch gestures.

Production browser QA created the disposable **Weekly availability verification** poll (`3QclTFT7MFbw69AA0hePJ`) with no calendar dates, the shared `America/Denver` time zone, and 84 half-hour cells across seven weekdays. Four Monday 17:00–19:00 cells were saved and persisted after reload; results ranked Monday 17:00–19:00 first for the two-hour duration. Browser warning and error logs were empty. The exact QA poll was then soft-deleted, and a browser reload confirmed **Page not found**. Evidence is saved at `/root/rshwub-deploy/weekly-ui-verification-88852a5.json`. The production check covered the desktop flow; the 390-pixel layout check above was local. The specific-date option rendered its calendar, and switching back restored the weekly form. Native ArrowDown changed Until from 23:00 to 22:00; reloading restored the defaults. Public health again reported the expected revision and connected database at 01:55:15 UTC.

The exact release image passed the isolated full-runtime smoke test at 01:50:29 UTC on October 20. It applied all 159 migrations, had 34 tables, rendered the login page, and passed the authentication checks. Cleanup passed. Evidence is saved at `~/.local/share/rshwub-meet-deploy/image-smoke-88852a59b80a71df5e66d499b693716c3a603879.json`.

The prior application image was `ghcr.io/grantwasil/rshwub-meet@sha256:f2ec49823011c91f4e2dc520d5cb78d3d828db6a0fcc0cf468bcf484ba728c7c` (revision `3991c2e`). It cannot read new weekly polls whose date lists are empty. After weekly records exist, prefer a compatible forward fix. An application rollback does not reverse these data migrations; do not automatically restore the pre-release dump, which would discard later writes.

## Passkey rollout — deployed and verified

The passkey release image was `ghcr.io/grantwasil/rshwub-meet@sha256:f2ec49823011c91f4e2dc520d5cb78d3d828db6a0fcc0cf468bcf484ba728c7c`, built from revision `3991c2e52ac8091c7c1d03d2c15c7e18cee8decb` by [workflow run 39346291745](https://github.com/GrantWasil/rshwub-meet/actions/runs/39346291745). Its OCI revision and Linux amd64 platform were verified before deployment. Public and strict origin-TLS checks passed at 00:22 UTC on October 20 (18:22 Colorado time on October 19).

The fork pins `@better-auth/passkey` to the same `1.6.30` version as Better Auth and its utility peer to `0.4.2`. The root override keeps `@peculiar/asn1-schema` at `2.11.0`, within all consumers' declared ranges: mixed schema registries caused valid P-256 signatures to fail. Keep the real cryptographic registration/assertion tests in `apps/web/src/features/auth/passkeys.test.ts` passing when upgrading these packages. Enrollment and credential changes require a verified non-guest account, an authoritative session created within 15 minutes, and no impersonation. The server requires WebAuthn user verification and binds credentials to the configured site origin/RP ID. Passkeys are disabled alongside email login on SSO-only instances.

The additive migration, `20261020000100_add_passkeys`, was rehearsed against a **schema-only** copy of the production database in a disposable local PostgreSQL 18 container using the same pinned image digest as production. The container used `--network none`, 512 MiB of memory, and no published ports. No production user data was copied or modified during the rehearsal.

The rehearsal passed: 33 existing tables became 34; the new table has 11 columns, its primary key, unique credential-ID constraint and user lookup index. Synthetic records verified duplicate-credential rejection, rejection of a missing user, and update/delete cascades. The disposable container and volume were removed. The tested migration SHA-256 is `41ed6e880a1fcda2df2b1ed1a5e253082452a6aa76dae55010f6fca36a7b8b7f`; repeat the rehearsal if that SQL changes. Non-secret evidence and the reusable check script are in `~/.local/share/rshwub-meet-deploy/passkey-migration-verification.json` and `check-passkey-migration.py`.

At the passkey postflight, production had the same completed migration and checksum, 34 tables, and no unfinished migrations. Existing application counts were unchanged across that rollout: 3 polls, 2 options, 2 participants, 2 votes, 1 comment, 3 users, 1 space and 1 membership. The verified personal account's instance role and space membership were unchanged. No passkeys had been created at the 00:22 UTC check. The existing database container/volume, service environment, resource limits and loopback binding were preserved; both protected deployment env files were updated to that release's digest.

Production HTTP checks confirmed a normal null response from a fresh `/api/better-auth/get-session`, top-level authentication options with `rpId=meet.rshwub.com` and `userVerification=required`, `Cache-Control: no-store`, Cloudflare `DYNAMIC` cache status and a fresh challenge on each request. Anonymous enrollment returned `403 PASSKEY_ACCOUNT_REQUIRED`; an authentication request carrying only its anonymous challenge cookie from an untrusted origin returned `403 INVALID_ORIGIN`. Challenges and cookie values were not printed. Evidence is retained in `~/.local/share/rshwub-meet-deploy/release-verification-3991c2e.json` and on the VPS at `/root/rshwub-deploy/passkey-after-3991c2e.json`.

A fresh production browser reload also confirmed the enabled **Sign in with a passkey** control alongside email login. This visual check does not establish real-device enrollment or sign-in.

Rollout history: revision `88d6009` was briefly deployed, then the web service was rolled back to `82b924a` when postflight found that a nested Better Auth middleware call wrapped ordinary auth responses and passkey options in `{headers, response}`. The additive database table was retained. Revision `3991c2e` uses plain helpers and adds regression tests with the same hook composition as production, including ordinary session/sign-out responses. An isolated full-image test reproduced the old failure and passed on the corrected image before its public deployment.

Before future image updates, run the retained full-runtime smoke test with the exact candidate image and revision. For example, the current release can be checked with:

```sh
python3 deploy/smoke-test-image.py \
  --image ghcr.io/grantwasil/rshwub-meet@sha256:9f82081660e4688ca813b696bd837b5211a4d8ef3d254ea90c5b3b86f1a97e6e \
  --revision f01c65cdc92b4c384425020b3bd8b964046bfc3a
```

It requires local Docker and Python 3. It starts an empty pinned PostgreSQL 18 database and the actual release image on an internal-only network, with no published ports or real credentials. HTTP probes run against the app container's loopback. The corrected passkey image applied all 156 migrations, rendered `/login`, and passed health, response-shape, required user verification, no-store, anonymous enrollment and origin checks. It created no users or passkeys and removed only its own containers, network and volume. Success evidence is saved only after verified cleanup, at `~/.local/share/rshwub-meet-deploy/image-smoke-<revision>.json`; diagnostic logs in that directory are protected. Require a zero exit before deployment.

Deploy only after the implementation checks pass and its immutable image's OCI revision matches the reviewed commit. Use the existing VPS helper `/root/rshwub-deploy/04-update-web.py` with the approved `--image` and `--revision`. It updates only the existing web service, preserves its environment and resource limits, verifies that the production database container and volume remain unchanged, and checks the expected revision and database health. The image startup applies Prisma migrations. Keep both protected deployment env copies synchronized with the effective image digest; do not re-import the stack or replace its database service.

After rollout, verify the named passkey migration has finished with no unfinished migrations, public HTTPS still works, the exact new revision appears in `/api/status`, and existing poll/account data remains accessible. Recheck origin TLS against the Cloudflare Origin CA if Openship rewrites the route. The new table is additive; an application rollback does not remove enrolled credentials, and the older image cannot use them for sign-in.

The final real-device check **passed** on October 19, 2026 (Colorado time). The owner reported that adding a passkey and signing back in both worked. A subsequent read-only production database check confirmed one passkey on the verified personal account and `lastLoginMethod: "passkey"`. Its instance role remained `user`, its space membership remained `ADMIN`, and ownership and roles matched the launch baseline. No credential IDs or public keys were included in the check output.

For future enrollment or regression checks:

1. Sign in to the verified personal account and open **Settings → Security → Passkeys** (`/settings/security`). If prompted, sign in again before changing passkeys.
2. Choose **Add a passkey**, name it, and complete the browser/device or password-manager confirmation yourself. Passkeys belong to the account; neither a space Admin role nor instance administrator access is required.
3. Confirm the passkey appears, then sign out and use **Sign in with a passkey** on the login page. Verify it opens the same account and its existing polls. Keep email sign-in available as recovery.

Automated policy, migration, or UI tests alone do not establish that enrollment and sign-in work with the owner's real authenticator. The owner's confirmation and account check above provide the separate real-device result; they do not establish compatibility with every browser or authenticator.

## Launch evidence — October 19, 2026

The original launch image was `ghcr.io/grantwasil/rshwub-meet@sha256:a65edd7cd2c6c0d473d665454f3df05a495ce915930a6f810012520342d3e02a`, built from revision `82b924a42678678484150bddb9eeb04e09bd4149` by [workflow run 39341356729](https://github.com/GrantWasil/rshwub-meet/actions/runs/39341356729). The non-secret operational evidence is retained locally at `~/.local/share/rshwub-meet-deploy/release-verification-82b924a.json` (recorded at 23:35:23 UTC). The later passkey and weekly-availability rollouts supersede this image.

Verified:

- Public `https://meet.rshwub.com/api/status` returned HTTP 200, database connected, and version `4.15.5-rshwub.82b924a42678678484150bddb9eeb04e09bd4149`. Both hostnames use valid origin TLS through Cloudflare Full (strict); the dashboard requires Access and its own login.
- Actual container resource limits match the table above. Web binds to `127.0.0.1:3100`; the database has no public ports. Direct checks from the management Mac reached SSH only, with ports 80, 443, 3001, 3100, 4000 and 5432 unreachable. An actual request with forged forwarding headers still reached the app with the verified visitor IP in `X-Real-IP`; the trusted-proxy flag is enabled.
- Classic and availability guest creation, voting/editing, comments, and results passed browser checks. Availability selection covered an eight-cell desktop drag, keyboard Space with Yes/Maybe/No, and tapping/range editing in a 390-pixel viewport. Denver 17:00–18:00 and New York 19:00–20:00 represented the same instants. Synthetic touch commands were unsupported, so this does not establish real-device touch or DST-transition behavior.
- The native time input responded correctly to ArrowDown, changing 23:00 to 22:00; the form was then reloaded to its default. An earlier automation fill result was not representative of native input behavior. Browser QA console error/warning logs were empty.
- Both private organizer links redeemed after clearing the five Meet cookies, then cleared their URL fragments. Participant recovery data remained in local storage, so this was fresh authentication, not a fully independent browser identity. Separate HTTP checks sent no cookies: both public polls reported `canManage: false`, organizer/edit routes denied access or redirected, wrong tokens were forbidden, and no management cookie was issued on rejection.
- Both poll modes finalized and exported the expected ICS instants: classic October 23, 2026 18:00–19:00 UTC; availability October 23 23:00 through October 24 00:00 UTC. Reopening preserved responses, and both final-time ICS endpoints returned 404. Calendar files already downloaded are not retracted by reopening or deleting a poll.
- Production web-restart persistence and the isolated production snapshot restore passed as described above. The availability QA poll was soft-deleted through the UI; a fresh browser showed Page not found and its ICS endpoint returned HTTP 404. The streamed page itself returned HTTP 200, so the status code alone does not establish whether a poll is visible. The classic QA poll was reopened with votes preserved, then closed through the UI so it accepts no further responses. It remains as a disposable test record. Fresh browser reloads or availability's Refresh results are needed when comparing sessions; results are not pushed live.

Since the launch checks, the owner created a verified personal account, the manual Linode launch snapshot reached **Success**, and the corrected passkey release passed runtime, production HTTP and owner real-device enrollment/sign-in checks. The current account's space Admin membership and instance `user` role were verified against the live application database and left unchanged. Still outstanding: configure then test independent encrypted off-host backups. The closed classic QA record is retained for now. Keep the public source link pointed at the corresponding deployed revision. The original launch restore drill retained no archive; the weekly-availability rollout separately retained a same-host dump. Do not report independent off-host recovery or real-device touch testing as complete.
