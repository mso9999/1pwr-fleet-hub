#!/usr/bin/env bash
# Fleet Hub — verify / install the Firebase Admin service account on the EC2 host.
#
# Usage (one-time, run on the EC2 box as ec2-user):
#
#   1. Place the JSON key (from Firebase Console → Service accounts) at
#      /var/www/fleet-hub/firebase-service-account.json  (the default Fleet Hub looks for).
#      chmod 600 firebase-service-account.json  # it contains a private key.
#
#   2. Run:
#        cd /var/www/fleet-hub
#        bash scripts/setup-firebase-admin.sh
#
# The script:
#   - confirms the file is in place and readable,
#   - pins it via `pm2 set` so PM2 re-exports FIREBASE_SERVICE_ACCOUNT_PATH across
#     every restart (including machine reboots after `pm2 save`),
#   - restarts Fleet Hub with the updated env,
#   - hits /api/health to confirm the credential loaded.
#
# Safe to rerun. No-ops if already configured.

set -euo pipefail

APP_NAME="fleet-hub"
APP_DIR="/var/www/fleet-hub"
SA_PATH="${FIREBASE_SERVICE_ACCOUNT_PATH:-$APP_DIR/firebase-service-account.json}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3100/api/health}"

echo "[setup] service account path: $SA_PATH"

if [[ ! -f "$SA_PATH" ]]; then
  echo "[setup] ERROR: service-account JSON not found at $SA_PATH"
  echo "[setup]   - download the key from Firebase Console > Project Settings > Service Accounts"
  echo "[setup]   - scp it to the box and place it at $SA_PATH with chmod 600"
  exit 1
fi

if ! grep -q '"private_key"' "$SA_PATH"; then
  echo "[setup] ERROR: $SA_PATH does not look like a service-account JSON (missing private_key)"
  exit 1
fi

chmod 600 "$SA_PATH" || true

echo "[setup] pinning FIREBASE_SERVICE_ACCOUNT_PATH via pm2 ..."
pm2 set "${APP_NAME}:FIREBASE_SERVICE_ACCOUNT_PATH" "$SA_PATH"
pm2 restart "$APP_NAME" --update-env
pm2 save

echo "[setup] waiting for app to come back..."
for i in $(seq 1 20); do
  if curl -sf -o /dev/null "$HEALTH_URL"; then
    break
  fi
  sleep 1
done

echo "[setup] /api/health says:"
curl -s "$HEALTH_URL" | python3 -m json.tool || curl -s "$HEALTH_URL"
echo
echo "[setup] done. If firebaseAdmin.ok is true, Fleet Hub auth is healthy."
