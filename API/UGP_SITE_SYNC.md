# UGP Site Sync (FM pulls sites from UGP)

**Status:** Live in production since 2026-05-30.
**Audience:** Fleet Hub developers/agents; UGP/PR integrators verifying the site-data chain.
**Base URL (production):** `https://fm.1pwrafrica.com`

---

## Purpose

Fleet Hub pulls country-aware site codes (with GPS coordinates where available) from the UGP system (`ugp.1pwrafrica.com`) into its local SQLite `reference_data` (`type = 'site'`). This seeds site GPS for route estimation and ensures FM's site list mirrors UGP's authoritative country configs.

This is the **FM-side pull** endpoint. It complements the PR-centered realtime push fanout documented in [`SITE_SYNC_INGEST.md`](./SITE_SYNC_INGEST.md) (PR → FM direct ingest).

---

## Endpoint

### `POST /api/sync/ugp-sites`

**Auth:** Firebase bearer token. Caller must be a Fleet Hub user with a fleet-management role (`fleet_lead`, `manager`, `admin`) or `superadmin`.

**Body:** none.

**Response 200:**

```json
{
  "success": true,
  "source": "https://ugp.1pwrafrica.com/api/cc/config/*",
  "organizations": [
    {
      "organizationId": "1pwr_lesotho",
      "countryCode": "LS",
      "upserted": 12,
      "created": 0,
      "updated": 12,
      "withCoords": 11,
      "missingCoords": 1
    }
  ],
  "upserted": 12,
  "created": 0,
  "updated": 12,
  "withCoords": 11,
  "missingCoords": 1
}
```

**Response 502:** upstream UGP fetch failed. Body includes `error`.

---

## Behavior

For each configured country code (env `UGP_SITE_COUNTRIES`, default `LS,BN,ZM`):

1. Fetch `GET {UGP_API_BASE_URL}/cc/config/{CC}` (Lesotho also tries `/cc/config` as a fallback).
2. For each site in the country config's `sites` object:
   - Normalize the code (uppercase) and parse the payload for `lat`/`lng` (accepts `lat`|`latitude`|`gps_y`|`GPS_Y` and `lng`|`lon`|`longitude`|`gps_x`|`GPS_X`).
   - If GPS is missing, fall back to `LEGACY_SITE_COORDINATES` for known site codes (HQ, MAK, MAS, SEB, MAT, LEB, SEH, QN, TY, BFN, JHB, OTHER).
   - Upsert into `reference_data` (`type = 'site'`) keyed by `(organization_id, code)`.
   - **Merge** the incoming GPS into the existing `meta` JSON without dropping other metadata keys; tag with `source: "ugp_cc_config"`, `source_country`, `source_label`.

---

## Org mapping

| Country code | Fleet org |
|---|---|
| `LS` | `1pwr_lesotho` |
| `BN` / `BJ` | `1pwr_benin` |
| `ZM` | `1pwr_zambia` |

---

## Environment variables

| Variable | Example | Notes |
|---|---|---|
| `UGP_API_BASE_URL` | `https://ugp.1pwrafrica.com/api` | Default if unset |
| `UGP_SITE_COUNTRIES` | `LS,BN,ZM` | Comma-separated ISO 2-letter codes; defaults to `LS,BN,ZM` |

No API key is currently required by UGP's `/cc/config/*` endpoints (public country configs). If UGP adds auth, add a `UGP_API_KEY` env and send it as `X-API-Key` in `src/lib/ugp-site-sync.ts`.

---

## Related: route-estimation GPS fallback

`src/lib/vehicle-request-fuel.ts` also keeps a `LEGACY_SITE_COORDINATES` fallback so route estimation does not fail when a site's `meta` lacks GPS (e.g. a site created before sync ran). This is independent of the UGP sync but covers the same gap for the route planner.

---

## Implementation references

| Concern | File |
|---|---|
| Sync library | `src/lib/ugp-site-sync.ts` |
| Endpoint | `src/app/api/sync/ugp-sites/route.ts` |
| Route-estimation GPS fallback | `src/lib/vehicle-request-fuel.ts` |

---

## Related docs

- [`SITE_SYNC_INGEST.md`](./SITE_SYNC_INGEST.md) — PR → FM direct fanout ingest (the push side of the site-sync chain).
