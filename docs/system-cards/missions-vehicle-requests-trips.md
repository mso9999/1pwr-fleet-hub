# System card: Missions, vehicle requests, trips

Concise business rules implemented in Fleet Hub for planning missions, optional logistics rows, reservations, and operational trips.

## Actors

| Capability | Who |
|------------|-----|
| Create a **mission** (trip plan) | Any signed-in user (`POST /api/missions`) — includes `missionProfile`, `requiredVehicleClass`, `rrStatus` |
| Approve / reject a **mission** | PR-credentialed approvers: fleet lead, manager, admin, superadmin, **or** email on `vehicle_check_override_approvers` (HR / country-filtered list in Admin) |
| Edit mission fields / reopen approval on material change | Creator while pending, or fleet management; material edits on an approved mission set `approval_status` back to `pending` (`PATCH /api/missions/[id]`) |
| Submit a **vehicle request** (logistics row) | Users on the **EHS approved drivers** register for the org (`ehs_approved_drivers`, matched by email). Superadmin may bypass for testing. Vehicle class may come from the linked **mission** when set. |
| Approve / reject a **vehicle request** (line item in FM) | Same PR-credentialed set as mission approval (`canApproveMissionRequests`) |
| **Reserve** a vehicle on a mission | **Fleet team lead** (`fleet_lead`) or **superadmin** — `POST /api/missions/[id]/reserve-vehicle` (transaction, overlap rules, today vs future vehicle status rules; manager+ `overrideReason` for overlaps) |
| Legacy assign via vehicle request | `POST /api/vehicle-requests/[id]/assign` — when `mission_id` is set, mirrors mission reservation rules |
| **Arbitrate** capacity (defer / cancel / reactivate lifecycle) | **Management** cohort with `canArbitrateMissionCapacity` — explicitly **not** fleet lead acting alone |
| Create an operational **trip** (checkout) | Authenticated user (`POST /api/trips`); optional `missionId` with readiness gates when mission-linked |

## Lifecycle

1. **Mission** — Created with `approval_status = pending`, `mission_profile`, `required_vehicle_class`, optional `rr_status`. PR approvers approve or reject via `PATCH /api/missions/[id]` (`action: approve | reject`). Until approved, it cannot be used for a new vehicle request (except documented override path).
2. **Vehicle request** (optional queue row) — After the mission is **approved**, an **approved driver** may submit a request linked with `missionId` (purpose, priority, etc.). Required class can be inherited from the mission.
3. **Vehicle reservation** — Fleet team lead reserves on the mission (`vehicle_reservations` + `missions.assigned_vehicle_id`). Date overlap is blocked unless a manager provides `overrideReason` (logged).
4. **Trip** — Operational checkout on `/trips` (concrete vehicle, odometer, readiness). May reference `missionId`; mission-linked readiness is enforced when applicable.

## Data

- **missions**: `approval_status`, `mission_profile`, `required_vehicle_class`, `assigned_vehicle_id`, `rr_status`, `lifecycle_status` (`active` | `deferred` | `capacity_cancelled`), optional `trip_id`.
- **vehicle_reservations**: interval per `vehicle_id` / `mission_id`; `status` (`active` | `superseded` | …); overlap enforced in app + transaction.
- **vehicle_requests**: `mission_id` for new inserts; must reference a mission with `approval_status = approved` (unless override). List view may show assigned vehicle from mission via join.
- **ehs_approved_drivers**: Org + email gate for `POST /api/vehicle-requests`.

## API summary

| Endpoint | Rule |
|----------|------|
| `POST /api/missions` | Authenticated user |
| `PATCH /api/missions/[id]` | Approvers (`approve` / `reject`); management arbitration (`defer` / `cancel_capacity` / `reactivate`); field updates per permissions |
| `GET /api/missions` | Query `approvalStatus`, `status`; includes `assigned_vehicle_code` via join |
| `POST /api/missions/[id]/reserve-vehicle` | Fleet lead / superadmin; overlap + status rules |
| `GET /api/missions/[id]/reserve-candidates` | Fleet lead / superadmin |
| `GET /api/missions/arbitration-queue` | Management arbitration cohort only |
| `POST /api/vehicle-requests` | Approved driver + approved mission (class from body or mission) |
| `GET /api/me/vehicle-request-eligibility` | `{ canRequestVehicle, isApprovedDriver }` |
| `GET /api/me/mission-request-can-approve` | `{ canApprove, canFullEdit, canAllocateVehicle, canArbitrateCapacity }` |
| `POST /api/vehicle-requests/[id]/assign` | Fleet lead or superadmin; mission-aware when `mission_id` set |
| `POST /api/trips` | Authenticated user; optional `missionId` + readiness |

## UI

- **Vehicle requests** page: create mission (profile, class, R&R); pending missions for approvers; optional driver logistics form; fleet block to reserve on approved missions; management arbitration card for a chosen departure date; request detail modal uses mission reserve API when the row is mission-linked.
