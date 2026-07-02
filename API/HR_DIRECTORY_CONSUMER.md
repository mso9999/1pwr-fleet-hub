# Fleet Hub as a Consumer of HR's Employee Directory API

**Status:** Live in production (verified by `HR API smoke test` workflow, 2026-06-30).
**Audience:** Fleet Hub developers/agents, and the HR Portal team confirming the consumer contract.
**Provider:** HR Portal — `https://hr.1pwrafrica.com` (see HR's own guide at `1PWR HR/hr_portal/docs/HR_API_INTEGRATION.md`).

---

## Why Fleet Hub calls HR

Fleet Hub uses HR's employee directory to populate the **passenger manifest** on the driver vehicle check. Passengers must be selected from real HR employees (referenced by canonical `employee_id`) — never typed as free text — so the manifest is unambiguous and HR can later link timecards to a specific field-deployment inspection. See [`DEPLOYMENTS_HR_API.md`](./DEPLOYMENTS_HR_API.md) for the reverse direction (Fleet Hub → HR).

---

## Auth

Every call to HR carries:

```http
X-API-Key: <HR_API_KEY>
```

- Env on Fleet side: `HR_API_KEY` (the value HR stores in their `HR_API_KEY_FLEET_HUB` slot).
- Env: `HR_API_BASE_URL` = `https://hr.1pwrafrica.com`.
- Both are **server-side only**; never exposed to the browser. Wired into the deploy workflow via GitHub secrets — see [`HR_API_WIRING.md`](./HR_API_WIRING.md).
- HR's IP allow-list is currently OFF. When HR turns it on, Fleet Hub's EC2 egress IP must be registered with HR.

---

## Endpoints Fleet Hub uses

### `GET /api/employees/directory?country=&department=&since=`

Used by the passenger manifest picker. All three query params optional and combinable.

Response: `{ count, employees: [{ id, employee_id, name, email, role, type, country, department, primary_deployment, current_position_title, employment_start_date, phone, headshot, status, last_updated_at }] }` — active employees only, ordered by name, strictly biographic.

Fleet Hub forwards `country` and `department` (the picker's filter dropdowns) and supports `since` for future incremental syncs.

### `GET /api/employees/meta`

Returns `{ countries: [...], departments: [...] }`. Fleet Hub uses this to populate the picker's country/department filter dropdowns dynamically (no hardcoded lists).

### Not currently used (available if needed)

- `GET /api/employees/lookup/{employee_id}` — minimal payload (employee_id, name, email, role). Useful for sign-in flow validation.
- `GET /api/employees/show/{employee_id}` — full directory record for one employee. Useful for resolving a single manifest entry or refreshing one row after an edit.

---

## Fleet Hub surface (internal, browser-facing)

The Fleet Hub browser never calls HR directly. It calls Fleet Hub's own server, which proxies to HR with the secret key:

| Fleet Hub endpoint | Auth | Forwards to HR |
|---|---|---|
| `GET /api/admin/hr-directory?country=&department=&since=` | Fleet bearer token + role gate (fleet mgmt / EHS / DPO / HR / IT / Fleet dept) | `GET /api/employees/directory` |
| `GET /api/admin/hr-directory/meta` | Same gate | `GET /api/employees/meta` |

The role gate is intentional — the directory contains PII-adjacent biographic data.

---

## Caching guidance (from HR's integration guide)

- `/directory` — cache 15–60 minutes server-side. Fleet Hub currently uses `next: { revalidate: 0 }` on the directory fetch (re-pull on each call); the picker caches in-component for its lifetime. Acceptable today; tighten to a 15-min server cache if HR rate-limits.
- `/meta` — cache 1–24 hours. Fleet Hub uses `next: { revalidate: 300 }` (5 min).
- `/lookup` and `/show` — cheap; fine to call on demand.
- Don't poll `/directory` more than once a minute.

For incremental syncs, pass `?since=<max(last_updated_at)>` and track the max cursor across cycles. `last_updated_at` may be null on legacy rows.

---

## Type contract

Fleet Hub's TypeScript interface (`src/lib/hr-directory-client.ts`):

```ts
interface HrDirectoryEmployee {
  id: number;
  employee_id: string | null;
  name: string;
  email: string;
  role: string;
  type: string;
  country: string | null;
  department: string | null;
  primary_deployment: string | null;
  current_position_title: string | null;
  employment_start_date: string | null;
  phone: string | null;
  headshot: string | null;
  status: string;
  last_updated_at: string | null;
}
```

This matches HR's published response shape field-for-field. If HR adds a new biographic field, extend this interface and the `normalizeEmployee` helper.

---

## What Fleet Hub does NOT receive from HR

Per HR's contract, the directory never exposes: salary, hourly rate, contract details, banking, leave balances, leave requests, timecard hours, overtime, per-diem, emergency contacts, performance reviews, or free-text HR notes. Fleet Hub's manifest picker and deployment API never assume those fields exist.

---

## Implementation references

| Concern | File |
|---|---|
| HR client (server-side fetch + types) | `src/lib/hr-directory-client.ts` |
| Fleet Hub proxy route (directory) | `src/app/api/admin/hr-directory/route.ts` |
| Fleet Hub proxy route (meta) | `src/app/api/admin/hr-directory/meta/route.ts` |
| Passenger manifest picker UI | `src/components/PassengerManifestPicker.tsx` |
| Env wiring / rotation runbook | [`HR_API_WIRING.md`](./HR_API_WIRING.md) |
