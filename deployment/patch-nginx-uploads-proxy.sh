#!/usr/bin/env bash
# Patch live Nginx: proxy /uploads/ to Next.js instead of filesystem alias.
#
# From your laptop (SSH key loaded):
#   scp deployment/patch-nginx-uploads-proxy.sh ec2-user@YOUR_HOST:/tmp/
#   ssh ec2-user@YOUR_HOST 'sudo bash /tmp/patch-nginx-uploads-proxy.sh'
#
# Optional: pass a different vhost path as first argument.
set -euo pipefail

CONF="${1:-/etc/nginx/conf.d/fleet-hub.conf}"

if [[ ! -f "$CONF" ]]; then
  echo "Config not found: $CONF" >&2
  exit 1
fi

BACKUP="${CONF}.bak.uploads-proxy.$(date +%Y%m%d%H%M%S)"
cp -a "$CONF" "$BACKUP"
echo "Backed up to $BACKUP"

export NGINX_CONF="$CONF"
python3 <<'PY'
import os
import pathlib
import re
import sys

conf = pathlib.Path(os.environ["NGINX_CONF"])
text = conf.read_text()

# Fix invalid variable if present (old ec2-setup typo)
text = text.replace("$proxy_for_addr", "$proxy_add_x_forwarded_for")

replacement = """    location /uploads/ {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_connect_timeout 60s;
        client_max_body_size 20M;
    }"""

# First closing brace ends the location block (Fleet Hub uploads block has no nested {})
pat = re.compile(r"^[ \t]*location /uploads/ \{[\s\S]*?\}", re.MULTILINE)
if not pat.search(text):
    print("ERROR: no 'location /uploads/' block found to replace.", file=sys.stderr)
    print("Add manually from deployment/ec2-setup.sh (location /uploads/ proxy_pass …)", file=sys.stderr)
    sys.exit(1)

new_text, n = pat.subn(replacement.strip("\n"), text, count=1)
if n != 1:
    print(f"ERROR: expected 1 replacement, got {n}", file=sys.stderr)
    sys.exit(1)

conf.write_text(new_text)
print("Updated:", conf)
PY

nginx -t
systemctl reload nginx
echo "Nginx reloaded OK."
