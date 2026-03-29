# 1PWR Fleet Hub — project context

Use this file so humans and assistants share the same baseline. Update it when architecture, deploy targets, or workflows change.

## Purpose

Internal fleet operations app: vehicles, work orders, inspections (including checklist CRUD in SQLite), trips, mechanics activity, triage view, daily update text, reports/CSV exports, map. Auth and user profile come from Firebase (PR System project); org-scoped data uses `organizationId` (default `1pwr_lesotho`).

## Repository

- **GitHub:** `https://github.com/mso9999/1pwr-fleet-hub`
- **Production URL:** `https://fm.1pwrafrica.com/` (see `deployment/ec2-setup.sh` for nginx notes)
- **Stack:** Next.js (App Router), React, Tailwind, SQLite (`better-sqlite3`), Firebase client auth + Firestore user docs

## Versioning

- **Source of truth:** `package.json` → `"version"` (semver: `major.minor.patch`).
- **Build:** `next.config.ts` exposes `NEXT_PUBLIC_APP_VERSION` (and `NEXT_PUBLIC_APP_NAME`) to client and server.
- **Runtime:** Browser console logs `[1PWR Fleet Hub]` with name + version on load; Node logs the same when the server process registers (see `instrumentation.ts`).
- **When to bump:** Increment before or with each meaningful deploy (features, fixes, or data migrations you want to trace). Patch for small fixes, minor for features, major for breaking changes.
- **CLI (optional):** From `fleet-hub/`, `npm version patch` / `minor` / `major` updates `package.json` and, if the repo is clean, creates a git tag—then rebuild/redeploy so the new semver appears in logs.

## Session logs

- **Folder:** `session-logs/`
- **Convention:** One file per calendar day you work on the app, or one file per focused session if a day spans unrelated efforts.
- **Name:** `YYYY-MM-DD.md` (add suffix `-pm`, `-2` only if you need multiple files the same day).
- **Content:** Date, participants (optional), goals, what changed (files/features), deploy/commit ref, follow-ups, issues found in testing.

## Key paths

| Area | Location |
|------|----------|
| App routes | `src/app/` |
| API routes | `src/app/api/` |
| SQLite schema / DB helper | `src/lib/db.ts` |
| Auth | `src/lib/auth-context.tsx`, `src/lib/firebase.ts` |
| Inspections UI + edit | `src/app/inspections/`, `src/components/InspectionEditForm.tsx`, `VehicleBodyDiagram.tsx` |
| In-app user guide | `src/app/guide/` (`/guide`, `/guide/inspections`, …) |
| Navigation shell | `src/components/AppShell.tsx` |

## Environment (typical)

Server needs a writable DB path and any Firebase admin secrets if used by scripts/APIs—mirror what production EC2 uses. Client relies on Firebase config in `src/lib/firebase.ts` (and authorized domain `fm.1pwrafrica.com` in Firebase console).

## Related materials

Spreadsheets and PDFs for specs/checklists often live in the parent Dropbox folder `(1PWR FLEET)`; this repo is the deployable app under `fleet-hub/`.
