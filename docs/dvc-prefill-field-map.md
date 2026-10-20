# Driver Vehicle Check: field prefill map

Form: `src/components/DriverVehicleCheckForm.tsx`. Two prefill sources, both built in `src/lib/vehicle-check-context.ts`:

- **Mission / trip** — `GET /api/missions/[id]/vehicle-check-context` (or `/api/trips/[id]/vehicle-check-context`), fetched for `?missionId=` / `?tripId=` and when a mission is picked.
- **Vehicle's last check** — `GET /api/vehicles/[id]/vehicle-check-context`, fetched every time the selected vehicle changes (with or without a mission). The vehicle must be visible to the org (owner, or borrower while seconded); the last check is the vehicle's most recent check from any org, because defects travel with the vehicle.

Every prefilled field stays editable and carries a green note ("from mission" / "from last check (date)") plus a green-tinted border; a field the user already edited is never overwritten. Precedence rules for the carry-over live in `src/lib/dvc-prefill.ts`.

| Field | Prefill source | Notes |
|---|---|---|
| Direction (departing / returning) | trip | Default `departing`; `returning` when the trip has `departed_at` set (already left, no checkin). Manual toggle always wins. |
| Vehicle (`vehicleId`) | mission / trip | `missions.assigned_vehicle_id`, else `trips.vehicle_id`. Ids starting `unallocated_` are ignored. Seconded-in vehicles resolve. |
| Driver name (`driverName`) | mission → current user → last check | Mission: `trips.driver_name`, else the "Driver (override, not yet EHS-approved): X" note on the linked `vehicle_requests`, else the designated operator. Otherwise the logged-in user's own EHS-approved record. Otherwise the last check's `driver_name` ("from last check"). Otherwise the user's name. |
| Inspector | current user | Read-only "Inspector: <name>". |
| Date | current user clock | Read-only. Mission departure / return dates and the mission fuel budget (`missions.fuel_liters`) are shown as info. |
| Odometer reading (`mileageKm`) | vehicle | Highest of: last check `mileage_km`, the vehicle's most recent trip `odo_end` (else `odo_start`), its most recent `trip_odometer_readings.odo_km`. Hint names the source and date. Advisory warnings when the entry is lower than that reading, or still equal to the untouched prefill. Required, as before. |
| Odometer photo, exterior photos | manual | Required, unchanged. |
| Route from / to | trip / mission | `trips.departure_location` / `destination`, else the mission's. |
| Mission / Trip (`tripId`) | mission / trip | Departing only. |
| Passenger manifest | manual | |
| Status items (20 pass/fail) | last check (defects) | Items that failed on the last check are pre-marked fail with the previous description, listed in a "Defects reported on the last check" panel. Each must be confirmed **Still present** or **Fixed** (or set in the grid) before submit. Others default pass. |
| Fuel (Fluid Levels) | last check | Same as other status items; when it passed last time the row shows "last check: OK". The form has no separate fuel-level reading. |
| Failure descriptions | last check | Carried with the defect; dropped on "Fixed" unless the user edited it. |
| Remarks | manual | Last check's remarks are shown read-only in the defects panel. |
| Equipment items (14 yes/no) | last check (missing) | Items missing on the last check are pre-marked "No" and confirmed like status defects. |
| 1PWR phone number | manual | |
| `organizationId`, `driverId` | current user / EHS register | Unchanged. |
