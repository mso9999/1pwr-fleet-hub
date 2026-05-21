#!/usr/bin/env bash
# Remove Apache Alias /uploads so requests proxy to Next.js (port 3100).
# Production uses httpd — see /etc/httpd/conf.d/fleet-hub*.conf
set -euo pipefail

for CONF in /etc/httpd/conf.d/fleet-hub.conf /etc/httpd/conf.d/fleet-hub-le-ssl.conf; do
  [[ -f "$CONF" ]] || continue
  BACKUP="${CONF}.bak.uploads-proxy.$(date +%Y%m%d%H%M%S)"
  cp -a "$CONF" "$BACKUP"
  echo "Backed up $BACKUP"
done

python3 <<'PY'
import pathlib
import re

block = re.compile(
    r"\n[ \t]*# Static uploads served directly\n"
    r"[ \t]*Alias /uploads /var/www/fleet-hub/public/uploads\n"
    r"[ \t]*<Directory /var/www/fleet-hub/public/uploads>\n"
    r"[\s\S]*?"
    r"[ \t]*</Directory>",
    re.MULTILINE,
)

for path in (
    pathlib.Path("/etc/httpd/conf.d/fleet-hub.conf"),
    pathlib.Path("/etc/httpd/conf.d/fleet-hub-le-ssl.conf"),
):
    if not path.exists():
        continue
    text = path.read_text()
    if not block.search(text):
        print("SKIP (no Alias block):", path)
        continue
    path.write_text(block.sub(
        "\n    # /uploads proxied via ProxyPass / → Next.js (DB + disk route)",
        text,
        count=1,
    ))
    print("Updated:", path)
PY

apachectl configtest
systemctl reload httpd
echo "httpd reloaded OK."
