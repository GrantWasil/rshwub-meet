#!/usr/bin/env python3
"""Create a private deployment env file without printing secrets or overwriting."""
import os
from pathlib import Path
import secrets
import sys

root = Path(__file__).resolve().parent.parent
destination = Path(sys.argv[1]) if len(sys.argv) == 2 else root / "deploy/.env"
if len(sys.argv) > 2:
    raise SystemExit("Usage: rshwub-init-env.py [destination]")
content = (root / "deploy/.env.example").read_text()
for marker in (
    "GENERATE_DATABASE_PASSWORD",
    "GENERATE_SESSION_SECRET",
    "GENERATE_MAINTENANCE_TOKEN",
):
    content = content.replace(marker, secrets.token_hex(32))
try:
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
except FileExistsError:
    raise SystemExit(f"Refusing to overwrite {destination}") from None
with os.fdopen(descriptor, "w") as stream:
    stream.write(content)
print(f"Created {destination} with mode 0600; fill in image digests and email settings.")
