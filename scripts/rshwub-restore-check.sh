#!/usr/bin/env bash
# Decrypt into a disposable isolated PostgreSQL 18 container, never production.
set -Eeuo pipefail
umask 077
[[ $# == 1 ]] || { echo "Usage: AGE_IDENTITY_FILE=... RESTORE_POSTGRES_IMAGE=... $0 backup.dump.age" >&2; exit 1; }
archive=$1
[[ -f "$archive" && -f "${AGE_IDENTITY_FILE:-}" ]] || { echo "Backup or age identity file missing" >&2; exit 1; }
[[ "${RESTORE_POSTGRES_IMAGE:-}" =~ ^(docker.io/library/)?postgres(:18[^@]*)?@sha256:[a-f0-9]{64}$ ]] || {
  echo "RESTORE_POSTGRES_IMAGE must be your pinned PostgreSQL 18 digest" >&2; exit 1;
}
for tool in docker age openssl; do
  command -v "$tool" >/dev/null || { echo "Missing required tool: $tool" >&2; exit 1; }
done
container="rshwub-restore-$(openssl rand -hex 6)"
cleanup() { docker rm --force --volumes "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
export POSTGRES_PASSWORD
POSTGRES_PASSWORD=$(openssl rand -hex 32)
docker run --detach --name "$container" --network none --memory 1g --cpus 1 \
  --mount type=volume,destination=/var/lib/postgresql \
  --env POSTGRES_PASSWORD --env POSTGRES_DB=restore_check \
  --label rshwub-meet.restore-check=true "$RESTORE_POSTGRES_IMAGE" >/dev/null
unset POSTGRES_PASSWORD
ready=false
for ((attempt=0; attempt<60; attempt++)); do
  if docker exec "$container" pg_isready --username=postgres --dbname=restore_check >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || { echo "Disposable PostgreSQL failed to start" >&2; exit 1; }
age --decrypt --identity "$AGE_IDENTITY_FILE" "$archive" |
  docker exec -i "$container" pg_restore --username=postgres --dbname=restore_check --no-owner --no-acl --exit-on-error
tables=$(docker exec "$container" psql --username=postgres --dbname=restore_check --tuples-only --no-align --command "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")
[[ "$tables" =~ ^[0-9]+$ && "$tables" -gt 0 ]] || { echo "Restored database has no application tables" >&2; exit 1; }
printf 'Restore succeeded: %s public tables; disposable container and volume will be removed.\n' "$tables"
echo "This proves the archive restores. Separately smoke-test a staging app against restored data before production recovery."
