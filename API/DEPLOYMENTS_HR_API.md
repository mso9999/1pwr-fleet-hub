# Fleet Hub → HR Deployments API

**Status:** Live in production (verified by `HR API smoke test` workflow, 2026-06-30).
**Audience:** HR Portal developers/agents consuming Fleet Hub field-deployment data to gate timecards and link to the driver inspection checklist.
**Base URL (production):** `https://fm.1pwrafrica.com`

---

## Authentication

Every request must carry an `X-API-Key` header containing a Fleet-issued key:

```http
GET /api/deployments/current?employee_id=1PWR0159F HTTP/1.1
Host: fm.1pwrafrica.com
X-API-Key: fm_live_<...>
Accept: application/json
```

- Env var on Fleet side: `FLEET_HR_API_KEY`.
- Optional IP allow-list: env `FLEET_HR_API_ALLOWED_IPS` (comma-separated IPs or CIDRs). If unset, the key alone gates access (current state).
- All endpoints are **read-only (`GET` only)**.
- Missing/bad key → `401 Unauthorized`. IP not allow-listed (when enabled) → `403 Forbidden`.

---

## Endpoints

### 1. `GET /api/deployments/current?employee_id=1PWR0159F`

Returns the employee's currently-active field deployment — the most recent **departing** driver vehicle check that lists them on the passenger manifest, whose linked trip has `departed_at` set and `checkin_at` null. `404` if none.

**Response 200:**

```json
{
  "employee_id": "1PWR0159F",
  "deployment_start_date": "2026-06-15T06:15:00.000Z",
  "deployment_end_date": null,
  "inspection_id": "9b1c4a2e-...-uuid",
  "inspection_url": "https://fm.1pwrafrica.com/vehicle-checks?inspection=9b1c4a2e-...-uuid",
  "vehicle": "X3 — Nissan Xtrail",
  "registration": "CB 1287",
  "status": "active",
  "organization_id": "1pwr_benin",
  "destination": "MAS",
  "departure_location": "HQ",
  "check_date": "2026-06-15"
}
```

**Response 404:**

```json
{ "error": "No active field deployment found for this employee.", "employee_id": "1PWR0159F" }
```

### 2. `GET /api/deployments?employee_id=1PWR0159F&from=2026-01-01&to=2026-06-30&limit=100`

Date-ranged history, newest first. `from`/`to` optional, `YYYY-MM-DD`, inclusive on `check_date`. `limit` optional (default 100, max 500).

**Response 200:**

```json
{
  "employee_id": "1PWR0159F",
  "count": 3,
  "from": "2026-01-01",
  "to": "2026-06-30",
  "deployments": [ { /* same shape as /current */ }, ... ]
}
```

### 3. `GET /api/deployments/inspection/{inspection_id}`

Returns a single, **redacted, HR-safe** driver-vehicle-check record. `404` if not found. This is the record an HR approver reaches from the `inspection_url` deep link on a timecard.

**Response 200:**

```json
{
  "inspection_id": "9b1c4a2e-...-uuid",
  "organization_id": "1pwr_benin",
  "check_date": "2026-06-15",
  "created_at": "2026-06-14T21:00:00.000Z",
  "direction": "departing",
  "route_from": "HQ",
  "route_to": "MAS",
  "mileage_km": 154200,
  "overall_pass": true,
  "has_exceptions": false,
  "exception_approved": false,
  "driver_name": "Hospice Chabi",
  "travel_phone_number": "+229 ...",
  "remarks": "",
  "passenger_manifest": [
    { "employee_id": "1PWR0159F", "name": "Hospice Chabi", "department": "O&M", "country": "BJ" }
  ],
  "vehicle": {
    "code": "X3",
    "make": "Nissan",
    "model": "Xtrail",
    "registration": "CB 1287"
  },
  "trip": {
    "id": "trip-uuid",
    "checkout_at": "2026-06-14T21:05:00.000Z",
    "departed_at": "2026-06-15T06:15:00.000Z",
    "checkin_at": null,
    "departure_location": "HQ",
    "destination": "MAS"
  },
  "inspection_url": "https://fm.1pwrafrica.com/vehicle-checks?inspection=9b1c4a2e-...-uuid"
}
```

`vehicle` and `trip` are `null` when no link exists (legacy inspections). `passenger_manifest` entries are always `{ employee_id, name, department, country }`.

---

## Field reference

### Deployment record (endpoints 1 & 2)

| Field | Type | Notes |
|---|---|---|
| `employee_id` | string | HR employee_id (echoed) |
| `deployment_start_date` | string \| null | ISO 8601. **Canonical field-deployment start** = trip `departed_at`, fallback `checkout_at`, fallback inspection `created_at`. Always present once a trip exists. |
| `deployment_end_date` | string \| null | ISO 8601, trip `checkin_at`. `null` while active. |
| `inspection_id` | string | UUID of the `driver_vehicle_checks` row |
| `inspection_url` | string | Browser-openable deep link to the inspection in Fleet Hub |
| `vehicle` | string \| null | `"<code> — <make> <model>"` |
| `registration` | string \| null | Vehicle license plate |
| `status` | `"active"` \| `"completed"` \| `"pending_departure"` | `active` = departed & not checked in; `completed` = checked in; `pending_departure` = trip not yet departed |
| `organization_id` | string | `1pwr_lesotho` \| `1pwr_benin` \| `1pwr_zambia` |
| `destination` | string \| null | Trip destination site code |
| `departure_location` | string \| null | Trip departure site code |
| `check_date` | string | `YYYY-MM-DD` of the inspection |

### Status semantics

| `status` | Meaning | HR timecard implication |
|---|---|---|
| `active` | Vehicle has departed (`departed_at` set), not yet checked in | Employee is currently in the field — timecard entries should be allowed and link to this deployment |
| `completed` | Trip checked in (`checkin_at` set) | Deployment ended; use `deployment_end_date` as the cutoff |
| `pending_departure` | Inspection recorded, trip exists but vehicle hasn't physically departed yet | Pre-deployment; gate timecards until `active` |

---

## How `deployment_start_date` is derived

HR treats this as canonical, so it must be stable per deployment. Resolution order:

1. **`trip.departed_at`** — set by the explicit "Start trip / Depart now" action (`POST /api/trips/[id]/depart`). This is the actual physical wheel-roll time and is the preferred value.
2. **`trip.checkout_at`** — fallback when the departure workflow hasn't been used yet (keys/odo handed over).
3. **`inspection.created_at`** — last-resort fallback so the field is always present.

Once set, `departed_at` does not shift on subsequent edits. See [`TRIP_DEPARTURE.md`](./TRIP_DEPARTURE.md) for the departure endpoint contract.

---

## How an employee is linked to a deployment

The link is the **passenger manifest** on the departing driver vehicle check. Each manifest entry references an HR employee by canonical `employee_id` (no free text — see [`HR_DIRECTORY_CONSUMER.md`](./HR_DIRECTORY_CONSUMER.md) for the picker). A "field deployment" for an employee is therefore:

> A `driver_vehicle_checks` row where `direction = 'departing'` AND the `passenger_manifest` JSON array contains an entry with `employee_id = <this employee>`, joined to its `trips` row via `dvc.trip_id`.

The query uses SQLite `json_extract` for precise membership (with a coarse `LIKE` pre-filter for index friendliness). See `src/lib/deployments.ts`.

---

## Operational notes for HR

- **Key issuance:** Fleet admin sets `FLEET_HR_API_KEY` in the Fleet Hub GitHub secrets; the deploy workflow writes it to `/var/www/fleet-hub/.env`. The current production key was minted 2026-06-29.
- **Deep link:** `inspection_url` points to `https://fm.1pwrafrica.com/vehicle-checks?inspection=<id>` — stable URL shape HR can pin in the timecard UI.
- **Biographic data only:** The deployments endpoints expose operational + manifest data. No salary, contract, banking, leave, or payroll fields are surfaced.
- **Eventual availability:** If Fleet Hub is briefly down, HR should fall back to the last-known-good cache rather than hard-failing the timecard UI.

---

## Smoke test

A reusable GitHub Actions workflow (`HR API smoke test`, `.github/workflows/hr-smoke-test.yml`) SSHes into the EC2 box and exercises both directions of the HR ↔ Fleet Hub contract. Run it any time:

```bash
gh workflow run "HR API smoke test" --repo mso9999/1pwr-fleet-hub
gh run watch --workflow="HR API smoke test" --repo mso9999/1pwr-fleet-hub
```

Last verified: 2026-06-30 — all five checks passed (HR directory 200, HR bad-key 401, HR meta 200, FM deployments 404 for unknown employee, FM bad-key 401).

---

## Implementation references

| Concern | File |
|---|---|
| Auth helper (X-API-Key + IP allow-list) | `src/lib/hr-api-auth.ts` |
| Deployment query layer | `src/lib/deployments.ts` |
| `GET /api/deployments/current` | `src/app/api/deployments/current/route.ts` |
| `GET /api/deployments` | `src/app/api/deployments/route.ts` |
| `GET /api/deployments/inspection/[id]` | `src/app/api/deployments/inspection/[id]/route.ts` |
