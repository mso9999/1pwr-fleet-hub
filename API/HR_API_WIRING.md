# Wiring `HR_API_BASE_URL` and `HR_API_KEY` into Fleet Hub

Fleet Hub's EHS page has a **Load employees from HR** card. It calls the HR Portal
directory API on behalf of a signed-in user. That needs two env vars on the Fleet Hub
runtime:

| Name | Example | Where it's consumed |
| ---- | ------- | ------------------- |
| `HR_API_BASE_URL` | `https://hr.1pwrafrica.com` | [`src/lib/hr-directory-client.ts`](../src/lib/hr-directory-client.ts) |
| `HR_API_KEY` | opaque 48+ bytes base64url | Sent as `X-API-Key` header |

Both are **server-side** secrets. They must never end up in `NEXT_PUBLIC_*` envs, the
browser bundle, or the repo.

---

## Path A — One-shot SSH (fastest)

Any operator with SSH to the Fleet Hub EC2 host can install the vars in under two
minutes. PM2's `set` writes them into its persisted env so the next `--update-env`
restart picks them up and `pm2 save` keeps them across reboots.

```bash
ssh ec2-user@<FLEET_EC2_HOST>

# Paste the actual values instead of the placeholders.
pm2 set fleet-hub:HR_API_BASE_URL https://hr.1pwrafrica.com
pm2 set fleet-hub:HR_API_KEY      <48-byte-secret>

pm2 restart fleet-hub --update-env
pm2 save

# Smoke test (no bearer required, just confirms the server is up):
curl -s https://fm.1pwrafrica.com/api/me/whoami | head -1
```

Then from a signed-in browser on `/ehs-approved-drivers`:

1. **Filter HR by country (optional)** → `LS`
2. Click **Load employees from HR**
3. Expect the dropdown to fill with HR Portal employees.

If the amber banner still shows `HR_API_BASE_URL or HR_API_KEY not configured`, the
PM2 env wasn't picked up — repeat the restart with `--update-env` or run
`pm2 env fleet-hub | grep HR_` to confirm. If it shows `HR API 401/403`, the key
doesn't match what the HR Portal expects; confirm with the HR-repo agent.

---

## Path B — Permanent via GitHub Actions (survives every future redeploy)

Preferred once someone can apply the one-time workflow change. This puts the values
in the Fleet Hub GitHub repo as Actions secrets and the deploy workflow sets them on
EC2 on every push.

### One-time setup

1. In GitHub → `mso9999/1pwr-fleet-hub` → **Settings** → **Secrets and variables** →
   **Actions** → **New repository secret**:
   - `HR_API_BASE_URL`
   - `HR_API_KEY`

2. In the same repo, open `.github/workflows/deploy.yml` in the **web editor**
   (Github's web editor doesn't hit the OAuth "workflow scope" block that local
   pushes from OAuth tokens do).

3. Replace the `Deploy to EC2 via SSH` step with the block below and commit straight
   to `main`. (Only the `env`, `envs`, and two new `pm2 set` lines are new; the rest
   of the script is identical to what's there today.)

```yaml
      - name: Deploy to EC2 via SSH
        uses: appleboy/ssh-action@v1.0.0
        env:
          HR_API_BASE_URL: ${{ secrets.HR_API_BASE_URL }}
          HR_API_KEY: ${{ secrets.HR_API_KEY }}
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ec2-user
          key: ${{ secrets.EC2_SSH_KEY }}
          envs: HR_API_BASE_URL,HR_API_KEY
          script: |
            cd /var/www/fleet-hub
            git fetch origin
            git reset --hard origin/main
            npm ci --production=false
            npm run build
            pm2 set fleet-hub:HR_API_BASE_URL "$HR_API_BASE_URL"
            pm2 set fleet-hub:HR_API_KEY      "$HR_API_KEY"
            pm2 restart fleet-hub --update-env
            pm2 save
            echo "Fleet Hub deployed successfully"
```

4. Commit message: `ops(deploy): inject HR_API_BASE_URL and HR_API_KEY into pm2`.

### Every deploy after this

`pm2 set` runs idempotently on each push, so the two vars are re-asserted on every
successful build. No drift, no forgotten reboots.

### Rotating the key

1. HR-repo agent mints a new `HR_API_KEY`.
2. Update the `HR_API_KEY` secret in GitHub → Secrets.
3. Push any commit to `main` (or manually re-run the **Deploy to EC2** workflow via
   `gh workflow run "Deploy to EC2"`).
4. Deploy re-writes the PM2 env and restarts; Fleet Hub is on the new key once the
   workflow goes green.

---

## Verifying from the browser

With the envs in place, the EHS page should:

1. Show the **Filter HR by country** input + **Load employees from HR** button.
2. On click → populate the **Employee** dropdown with HR Portal entries.
3. Show no amber `HR_API_*` warning.

If it still fails, check, in order:

- `curl https://fm.1pwrafrica.com/api/me/whoami` — should return something other than
  `auth_unconfigured` (we now verify tokens via Google JWKS, so this is rarely the
  problem).
- `pm2 env fleet-hub | grep HR_` on EC2 — confirm both vars are set and not the
  literal string `undefined`.
- `curl -sS -H "X-API-Key: $HR_API_KEY" "$HR_API_BASE_URL/api/employees/directory?country=LS" | jq .count`
  directly from the EC2 box — should return an integer. If 401/403, the key is
  rejected upstream; if 0 or missing `employees`, the HR side is returning the wrong
  shape (share the raw body with the HR-repo agent).

---

## Why this was initially missing

A past deploy wiped the PM2 env without re-planting `HR_API_*` (and also
`FIREBASE_SERVICE_ACCOUNT_PATH`). The Firebase side is now self-healing (token
verification falls back to Google JWKS with no local credential needed, see
[`src/lib/verify-firebase-id-token.ts`](../src/lib/verify-firebase-id-token.ts));
the HR side still needs a secret we can't synthesize from public info. Path B
above closes that loop.
