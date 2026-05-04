# System card: Missions, vehicle requests, trips

Concise business rules implemented in Fleet Hub for planning missions, requesting vehicles, and recording operational trips.

## Actors

| Capability | Who |
|------------|-----|
| Create a **mission** (trip plan) | Any signed-in user (`POST /api/missions`) |
| Approve / reject a **mission** | PR-credentialed approvers: fleet lead, manager, admin, superadmin, **or** email on `vehicle_check_override_approvers` (HR / country-filtered list in Admin) |
| Submit a **vehicle request** | Users on the **EHS approved drivers** register for the org (`ehs_approved_drivers`, matched by email). Superadmin may bypass for testing. Requests specify **vehicle type / asset class** only (e.g. 4WD SUV & bakkie, cargo truck); they do **not** lock a specific vehicle. |
| Approve / reject a **vehicle request** (line item in FM) | Same PR-credentialed set as mission approval (`canApproveMissionRequests`) |
| **Allocate** a vehicle to a request (pool assignment) | **Fleet team lead** (`fleet_lead`) or **superadmin** only |
| Create an operational **trip** (checkout) | Any signed-in user (`POST /api/trips` requires auth); separate from missions / vehicle requests |

## Lifecycle

1. **Mission** — Created with `approval_status = pending`. PR approvers approve or reject via `PATCH /api/missions/[id]` (`action: approve | reject`). Until approved, it cannot be used for a vehicle request.
2. **Vehicle request** — Only after the mission is **approved**. Submitted by an **approved driver**, linked with `missionId`. Uses existing approve/reject flow on the vehicle request record (R&R, etc.).
3. **Vehicle allocation** — Fleet team lead picks a pool vehicle (`POST /api/vehicle-requests/[id]/assign`). Moves request to `assigned`.
4. **Trip** — Operational checkout on `/trips` (concrete vehicle, odometer, readiness). Separate from planned missions; use **Vehicle requests** for management-approved missions and type-based allocation before check-out. Optional future link via `missions.trip_id`.

## Data

- **missions**: `approval_status` ∈ `pending` | `approved` | `rejected`; optional `trip_id` when linked to an operational trip.
- **vehicle_requests**: `mission_id` required for new inserts; must reference a mission with `approval_status = approved`.
- **ehs_approved_drivers**: Org + email gate for `POST /api/vehicle-requests`.

## API summary

| Endpoint | Rule |
|----------|------|
| `POST /api/missions` | Authenticated user |
| `PATCH /api/missions/[id]` | PR credentialed approvers |
| `GET /api/missions` | Query `approvalStatus`, `status` (e.g. `approvalStatus=approved` for vehicle request picker) |
| `POST /api/vehicle-requests` | Approved driver + approved mission |
| `GET /api/me/vehicle-request-eligibility` | `{ canRequestVehicle, isApprovedDriver }` |
| `GET /api/me/mission-request-can-approve` | `{ canApprove, canFullEdit, canAllocateVehicle }` |
| `POST /api/vehicle-requests/[id]/assign` | Fleet lead or superadmin |
| `POST /api/trips` | Authenticated user |

## UI

- **Vehicle requests** page: (1) create mission, (2) request vehicle when mission is approved and user is an approved driver; pending missions list for approvers; allocation UI only for fleet lead / superadmin.
