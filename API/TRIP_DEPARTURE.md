# Trip Departure API

**Status:** Live in production since 2026-06-29.
**Audience:** Fleet Hub developers/agents, and integrators who need to understand the canonical field-deployment start timestamp.
**Base URL (production):** `https://fm.1pwrafrica.com`

---

## Why this exists

A driver inspection checklist records when the **inspection** was performed (often the evening before travel). The **actual physical departure** is a separate event that can happen the next morning. Conflating the two produced ambiguous "departure" timestamps for HR timecards and route reconciliation.

This endpoint records the real wheel-roll moment as its own first-class, attested event on the trip, re-runs the readiness gate at that moment, and cross-checks the vehicle's tracker history against the planned departure date.

---

## Endpoint

### `POST /api/trips/{trip_id}/depart`

**Auth:** Firebase bearer token (same as other Fleet Hub trip endpoints). Must be a signed-in Fleet Hub user.

**Body (JSON, all fields optional):**

| Field | Type | Notes |
|---|---|---|
| `actualOdoStart` | number | Optional corrected odometer at departure. If provided and ≥ 0, overwrites `trips.odo_start`. |
| `overrideReason` | string | Required only if the readiness gate is blocked at departure time and an approver is authorizing the bypass. Minimum 8 characters. |

**Response 200:** the updated trip row plus a `departureDiscrepancy` object.

**Response 409:** trip already departed or already checked in.

**Response 400:** readiness gate blocked and no override reason supplied. Body includes `gates` array:

```json
{
  "error": "Trip readiness requirements are not met at departure time. Provide an override reason (an approver can bypass).",
  "gates": [
    { "id": "driver_checklist", "label": "Driver checklist (departing)", "status": "blocked",
      "detail": "The last departing checklist for X3 was on 2026-06-14 and is outside the 24h validity window. Re-inspect before departing (planned departure 2026-06-15), or tag the check as valid for the departure date." }
  ],
  "missionProfile": "field",
  "reason": "readiness_blocked"
}
```

**Response 403:** override reason supplied but the user lacks `canOverridePrerequisite` permission.

---

## What it does (server-side)

1. **Loads the trip**, refuses if `departed_at` or `checkin_at` is already set.
2. **Re-runs `evaluateReadinessForMissionLinkedTrip`** at departure time with `referenceNow = now`. This is the key behavior: a pre-departure checklist that was fine at checkout but is now >24h old blocks the wheel-roll.
3. **Override path:** if the gate is blocked and an `overrideReason` (≥ 8 chars) is supplied by a user with `canOverridePrerequisite`, the departure proceeds and the bypass is audit-logged.
4. **Stamps `departed_at`**, `departure_confirmed_by_id`, `departure_confirmed_by_name`.
5. **Optional `actualOdoStart`** overwrites `trips.odo_start` if provided.
6. **Tracker cross-check** (see below) writes `trips.departure_discrepancy` as JSON.
7. **Writes `status_log`** row: `trip`, `checked-out` → `departed`.
8. **Audit log** via `record_mutation_log` (action `update`, or `prerequisite_override` when an override was used with the reason).

---

## Readiness gate: pre-departure checklist validity

`src/lib/trip-readiness.ts` accepts a departing DVC when **any** of:

- it was performed on today's `checkDate`, OR
- `valid_for_departure_on` matches the planned departure date (set when an evening check covers a next-morning departure), OR
- `created_at` is within `DVC_VALIDITY_WINDOW_HOURS = 24`.

Otherwise the gate blocks with a clear detail message naming the vehicle, the last check date, the validity window, and the planned departure date.

---

## Tracker cross-check

`src/lib/trip-departure.ts` → `evaluateTrackerDepartureDiscrepancy`:

- Scans `vehicle_gps_snapshots` for the vehicle, from the start of the planned departure day through a 3-day window.
- Finds the first snapshot that moved > 200 m from the trip's departure point (or reports speed ≥ 5 km/h).
- Compares that movement's calendar date to `planned_departure_date`.
- If first movement is on a **later calendar day** than planned, `discrepancy = true`.

Result is stored on `trips.departure_discrepancy` as JSON and returned to the caller. Vehicles without a working tracker get an inconclusive result and are skipped (no false flags). The cross-check relies on `vehicle_gps_snapshots`, which is populated by the existing SinoTrack poll in `/api/vehicles/locations`.

```json
{
  "discrepancy": true,
  "detail": "Planned departure 2026-06-15, but tracker first moved on 2026-06-16 at 2026-06-16T05:42:00.000Z. Vehicle did not leave on the inspection date.",
  "firstMovedAt": "2026-06-16T05:42:00.000Z",
  "lastStationaryAt": "2026-06-15T22:10:00.000Z",
  "trackerAvailable": true
}
```

---

## Schema (migration-safe)

`trips` columns added by this feature (see `src/lib/db.ts` `migrateTripsPhase1`):

| Column | Type | Notes |
|---|---|---|
| `planned_departure_date` | TEXT | `YYYY-MM-DD`, set at checkout from the linked mission's `departure_date` |
| `departed_at` | TEXT | ISO 8601 — the canonical field-deployment start for HR |
| `departure_confirmed_by_id` | TEXT | Fleet user id who pressed "Start trip" |
| `departure_confirmed_by_name` | TEXT | Display name snapshot |
| `departure_discrepancy` | TEXT | JSON from `evaluateTrackerDepartureDiscrepancy`, or null |

`driver_vehicle_checks` also gained `valid_for_departure_on TEXT` so an evening check can be tagged as covering the next morning's departure.

---

## UI

The Trips page (`/trips`) shows:

- "Checked out: … · Departed: pending/… · Planned: …" on active trips.
- A **Start trip** button on active, not-yet-departed trips → opens a `DepartureForm` (actual ODO + optional override reason).
- A discrepancy banner (amber for flagged, emerald for confirmed) on the active row and in the trip history detail.

---

## Implementation references

| Concern | File |
|---|---|
| Endpoint | `src/app/api/trips/[id]/depart/route.ts` |
| Tracker cross-check | `src/lib/trip-departure.ts` |
| Readiness gate (DVC validity window) | `src/lib/trip-readiness.ts` |
| Mission-linked readiness (passes `plannedDepartureDate`) | `src/lib/mission-deployment-readiness.ts` |
| Schema migration | `src/lib/db.ts` (`migrateTripsPhase1`) |
| UI | `src/app/trips/page.tsx` (`DepartureForm`) |
