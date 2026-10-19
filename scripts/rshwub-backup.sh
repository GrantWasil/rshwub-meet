#!/usr/bin/env bash
# Run by the independent systemd timer; never source an untrusted env file.
set -Eeuo pipefail
umask 077

for tool in docker age aws sha256sum stat mktemp; do
  command -v "$tool" >/dev/null || { echo "Missing required tool: $tool" >&2; exit 1; }
done
for key in BACKUP_DB_VOLUME BACKUP_DB_USER BACKUP_DB_NAME BACKUP_S3_BUCKET BACKUP_S3_ENDPOINT AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AGE_RECIPIENT; do
  [[ -n "${!key:-}" ]] || { echo "Missing required setting: $key" >&2; exit 1; }
done
[[ "$BACKUP_S3_ENDPOINT" == https://* ]] || { echo "Backup endpoint must use HTTPS" >&2; exit 1; }
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}" AWS_PAGER="" AWS_EC2_METADATA_DISABLED=true
prefix="${BACKUP_S3_PREFIX:-rshwub-meet/postgres}"
[[ "$BACKUP_S3_BUCKET" =~ ^[a-z0-9][a-z0-9.-]+$ && "$prefix" =~ ^[a-zA-Z0-9/_-]+$ ]] || {
  echo "Invalid backup bucket or prefix" >&2; exit 1;
}
containers=$(docker ps --filter "volume=$BACKUP_DB_VOLUME" --format '{{.ID}}')
[[ "$containers" =~ ^[a-f0-9]+$ ]] || {
  echo "Expected exactly one running container using the configured database volume" >&2; exit 1;
}
temporary=$(mktemp -d)
trap 'rm -rf -- "$temporary"' EXIT
stamp=$(date -u +%Y-%m-%dT%H-%M-%SZ)
filename="${stamp}.dump.age"
archive="$temporary/$filename"
# pg_dump takes a consistent database snapshot; pipefail catches either stage.
# Only encrypted bytes are written to the host filesystem.
docker exec "$containers" pg_dump --username="$BACKUP_DB_USER" --dbname="$BACKUP_DB_NAME" --format=custom --no-owner --no-acl |
  age --recipient "$AGE_RECIPIENT" --output "$archive"
[[ -s "$archive" ]] || { echo "Encrypted backup is empty" >&2; exit 1; }
(cd "$temporary" && sha256sum "$filename" > "$filename.sha256")
destination="s3://$BACKUP_S3_BUCKET/$prefix/$filename"
aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 cp "$archive" "$destination" --only-show-errors
aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 cp "$archive.sha256" "$destination.sha256" --only-show-errors
remote_bytes=$(aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3api head-object --bucket "$BACKUP_S3_BUCKET" --key "$prefix/$filename" --query ContentLength --output text)
local_bytes=$(stat -c %s "$archive")
[[ "$remote_bytes" == "$local_bytes" ]] || { echo "Uploaded backup size does not match" >&2; exit 1; }
printf 'Encrypted backup uploaded and size verified: %s (%s bytes)\n' "$destination" "$local_bytes"
