#!/usr/bin/env python3
"""Validate this project's simple KEY=value env format without evaluating it."""
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parent.parent
path = Path(sys.argv[1]) if len(sys.argv) == 2 else root / "deploy/.env"
if len(sys.argv) > 2:
    raise SystemExit("Usage: rshwub-validate-env.py [env-file]")
values = {}
for number, line in enumerate(path.read_text().splitlines(), 1):
    if not line.strip() or line.lstrip().startswith("#"):
        continue
    key, separator, value = line.partition("=")
    if not separator or not re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
        raise SystemExit(f"Invalid assignment on line {number}; use plain KEY=value.")
    if key in values:
        raise SystemExit(f"Duplicate key: {key}")
    # The template deliberately avoids shell interpolation/quoted dotenv values.
    if any(char in value for char in "\"'$`\\\r\n") or value != value.strip():
        raise SystemExit(f"Use an unquoted value without interpolation for {key}.")
    values[key] = value

errors = []
for key, pattern in (
    ("RSHWUB_MEET_IMAGE", r"ghcr\.io/grantwasil/rshwub-meet@sha256:[a-f0-9]{64}"),
    ("POSTGRES_IMAGE", r"(?:docker\.io/library/)?postgres(?::18[^@]*)?@sha256:[a-f0-9]{64}"),
):
    if not re.fullmatch(pattern, values.get(key, "")):
        errors.append(f"{key} must be the expected image pinned by digest")
for key in ("POSTGRES_PASSWORD", "SECRET_PASSWORD", "MAINTENANCE_BYPASS_TOKEN"):
    if not re.fullmatch(r"[a-f0-9]{64}", values.get(key, "")):
        errors.append(f"{key} must be a generated 64-character hex secret")
if not re.fullmatch(r"re_[A-Za-z0-9_-]+", values.get("SMTP_PWD", "")):
    errors.append("SMTP_PWD must be a Resend API key")
for key in ("SUPPORT_EMAIL", "NOREPLY_EMAIL", "INITIAL_ADMIN_EMAIL"):
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", values.get(key, "")):
        errors.append(f"{key} must be a valid email address")
if values.get("MAINTENANCE_MODE") not in ("true", "false"):
    errors.append("MAINTENANCE_MODE must be true or false")
if values.get("TRUST_PROXY_X_REAL_IP") != "true":
    errors.append("TRUST_PROXY_X_REAL_IP must be true for this deployment's trusted edge; it must overwrite X-Real-IP and block direct application access")
if path.stat().st_mode & 0o077:
    errors.append("env file must not be readable or writable by group/others (chmod 600)")
if errors:
    raise SystemExit("Configuration needs attention:\n- " + "\n- ".join(errors))
print("Deployment environment passed validation (values redacted).")
