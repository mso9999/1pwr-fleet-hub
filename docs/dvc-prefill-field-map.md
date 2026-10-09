# Driver Vehicle Check: field prefill map

Form: `src/components/DriverVehicleCheckForm.tsx`. Prefill source is the mission/trip context from
`GET /api/missions/[id]/vehicle-check-context` (or `/api/trips/[id]/vehicle-check-context`), built by
`src/lib/vehicle-check-context.ts`. Every prefilled field stays editable; a field the user already edited is never overwritten.

| Field | Prefill source | Notes |
|---|---|---|
| Direction (departing / returning) | trip | Default `departing`; `returning` when the trip has `departed_at` set (already left, no checkin). Manual toggle always wins. |
| Vehicle (`vehicleId`) | mission / trip | `missions.assigned_vehicle_id`, else `trips.vehicle_id`. Ids starting `unallocated_` are ignored. |
| Driver name (`driverName`) | trip / mission request / current user | `trips.driver_name`, else the "Driver (override, not yet EHS-approved): X" note on the linked `vehicle_requests`, else the designated operator's display name (`ehs_approved_drivers`). Falls back to the current user's name (existing behaviour); the existing "logged-in user's approved record" auto-fill still applies when no mission driver exists. |
| Inspector | current user | Shown read-only as "Inspector: <name>"; submit already records the logged-in user as actor. |
| Date | current user clock | Read-only today's date (unchanged). Mission departure / return dates are shown as extra read-only info (mission). |
| Odometer reading (`mileageKm`) | last check / trip | Default = max of last `driver_vehicle_checks.mileage_km` for the vehicle and the trip's `odo_end`/`odo_start`. (`vehicles` has no odometer column.) Editable, required; the driver must still confirm/enter it. |
| Odometer photo | manual | Required, unchanged. |
| Exterior photos (front, rear, left, right) | manual | Required, unchanged. |
| Route from (`routeFrom`) | trip / mission | `trips.departure_location`, else `missions.departure_location`. |
| Route to (`routeTo`) | trip / mission | `trips.destination`, else `missions.destination`. |
| Mission / Trip (`tripId`) | mission / trip | From `?tripId=` / `?missionId=` URL params or the picker; selecting a trip in the eligible list triggers a context fetch. Departing only. |
| Passenger manifest | manual | Departing only; picker unchanged (HR directory). |
| Status items (20 pass/fail) | manual | Default pass, unchanged. |
| Failure descriptions | manual | Required per failed item, unchanged. |
| Remarks | manual | |
| Equipment items (14 yes/no) | manual | Default yes, unchanged. |
| 1PWR phone number (`travelPhoneNumber`) | manual | |
| `organizationId` | current user | Unchanged. |
| `driverId` | current user / EHS register | Matched approved driver id, else logged-in user id (unchanged). |
