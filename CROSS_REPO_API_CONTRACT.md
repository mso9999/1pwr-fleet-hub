# Cross-Repo API Contract — Fleet Management (FM)

**Owner:** 1PWR Fleet (`fm.1pwrafrica.com`, EC2 `16.28.64.221`, Next.js + SQLite)
**Canonical data owned:** Vehicles, trips, GPS/employee locations, missions, loadout manifests.
**Source of truth for:** fleet + field-movement data.

Master ownership map: `nexus-portal/docs/CANONICAL_DATA_OWNERSHIP.md`.

## Authentication

All `/api/integrations/v1/*` endpoints require `X-Fleet-Integration-Key: <FLEET_INTEGRATION_API_KEY>`.
The key is provisioned in FM's `.env` and shared with PR + AM.

## Exposed APIs

| Method | Path | Purpose | Envelope | Consumers |
|--------|------|---------|----------|-----------|
| GET | `/api/integrations/v1/vehicles` | Vehicle registry (`?org=1pwr_lesotho&includeInactive=true`) | `{organizationId, count, vehicles[]}` | AM, PR |
| GET | `/api/integrations/v1/trips` | Trip list (`?limit=`) | `{count, trips[]}` | AM, HR |
| GET | `/api/integrations/v1/employee-locations/live` | Live employee locations | `{count, locations[]}` | HR, Nexus |
| GET | `/api/integrations/v1/vehicles/{id}/history` | Vehicle history | `{count, history[]}` | AM |
| GET | `/api/integrations/v1/missions` | Mission list | `{count, missions[]}` | HR, PR |
| GET | `/api/integrations/v1/missions/{id}` | Mission detail | `{...}` | HR, PR |
| GET/POST | `/api/integrations/v1/work-orders/{id}` + `/pr-links` | Work order ↔ PR link | `{...}` | PR |

Vehicle item shape: `fmVehicleId, organizationId, fleetCode, make, model, year, licensePlate, vin, engineNumber, status, prFirestoreId, updatedAt` (camelCase).

## Consumed from other repos

| From | API | Purpose |
|------|-----|---------|
| HR | `/api/departments` (X-API-Key) | Department dropdowns (replaces PR Firestore mirror) |
| PR | `prCatalogApi/api/sites` (X-API-Key) | Sites (replaces direct Firestore read) |

## Change management

- Additive field changes only; AM caches vehicle fields.
- FM pushes a vehicle mirror to PR's `referenceData_vehicles` (FM is the author).
- New integration endpoints: register here + in the master ownership map.
