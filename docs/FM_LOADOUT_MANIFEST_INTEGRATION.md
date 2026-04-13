# Fleet Management (FM) — Load-out manifest integration

> **Fleet Hub copy:** This file lives in `fleet-hub/docs/`. The Asset Management app (**am.1pwrafrica.com**, OneStop Asset Shop repo) owns the `am_core_loadout_manifests` collection and REST API; keep this doc in sync when the contract or endpoints change.

**Audience:** Developer or agent implementing features in **fm.1pwrafrica.com** (Fleet Management).  
**Counterpart system:** Asset Management — **am.1pwrafrica.com** (OneStop Asset Shop).  
**Shared backend:** Firebase project `pr-system-4ea55` (same as PR, Job Cards, AM).

---

## 1. Feature goal

Users plan **trips** in FM. Operations prepare **load-out manifests** (packing lists) in AM for goods leaving HQ toward a site. FM should:

1. **Show** which AM manifest(s) are linked to the **current trip** (read-only display is enough for v1).
2. **Associate** a manifest to a trip by setting the canonical **`trip_id`** on the AM side (either from FM after the trip exists, or confirm a value pasted from AM).

The **source of truth for manifest content** (lines, quantities, status, print view) remains **AM**. FM does not duplicate line items unless you deliberately add a cached summary later.

---

## 2. Firestore contract

### Collection (owned by AM)

| Collection | Owner |
|------------|--------|
| `am_core_loadout_manifests` | AM (`am.1pwrafrica.com`) |

### Document fields FM should care about

| Field | Type | Notes |
|-------|------|--------|
| `manifest_number` | string | Human-readable, e.g. `LO-2026-0001` — good for UI labels |
| `title` | string | Optional short title |
| `status` | string | `Draft` \| `Packed` \| `Shipped` \| `Delivered` \| `Cancelled` |
| `trip_id` | string | **FM writes this** when linking — should equal the **Firestore document ID** of the trip in FM (recommended). |
| `trip_label` | string | Optional display string (e.g. trip name + date) |
| `destination_site_label` | string | Denormalized; useful for FM list display without joins |
| `lines` | array | Line objects: `asset_id`, `quantity`, `notes`, snapshots — **read in FM only if you need a preview**; full editing stays in AM |
| `updated_at` | string | ISO timestamp |
| `linked_from_fm` | boolean | AM API may set this when linking via REST |

**Linking rule (recommended):**  
`trip_id` on the manifest doc **===** `doc.id` of the trip document in FM’s trips collection (whatever collection FM uses, e.g. `trips/{tripId}`). That makes queries trivial:  
`where('trip_id', '==', currentTripId)`.

If FM’s trip IDs are not Firestore doc IDs (e.g. only a business code exists), either:

- Store that code in `trip_id` **consistently** in both systems, or  
- Add an optional field on the manifest such as `trip_code` in a future AM change (not in scope unless agreed).

---

## 3. Ways to implement on FM

### Option A — Direct Firestore (typical for same project)

FM already uses the Firebase JS SDK with user sign-in.

1. **List manifests for this trip**

   ```ts
   // Pseudocode — adjust collection/collectionGroup imports for your FM app
   import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

   const db = getFirestore();
   const q = query(
     collection(db, 'am_core_loadout_manifests'),
     where('trip_id', '==', tripDocId) // tripDocId === doc.id of this trip
   );
   const snap = await getDocs(q);
   ```

2. **Link a manifest to the trip** (Manager-level user — see rules below)

   ```ts
   import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

   await updateDoc(doc(db, 'am_core_loadout_manifests', manifestDocId), {
     trip_id: tripDocId,
     trip_label: optionalLabel,
     updated_at: new Date().toISOString(), // or serverTimestamp() if rules allow
     // linked_from_fm: true  // optional
   });
   ```

3. **Unlink**

   ```ts
   await updateDoc(doc(db, 'am_core_loadout_manifests', manifestDocId), {
     trip_id: '',
     trip_label: '',
     linked_from_fm: false,
     updated_at: new Date().toISOString(),
   });
   ```

**Security:** Firestore rules for `am_core_loadout_manifests` require authenticated users; **create/update/delete** require **Manager-level** PR permission (same helper pattern as other AM collections). If FM users hit `permission-denied`, confirm their `users/{uid}` document has `permissionLevel` ≥ 3 (Manager) or adjust product policy / rules in a coordinated change.

---

### Option B — AM REST API (proxy; no Firestore SDK writes from FM)

Useful for server-side FM jobs or if the FM frontend prefers HTTP only.

**Base URL:** `https://am.1pwrafrica.com/api/loadout-manifests/index.php`

**Auth (pick one):**

1. **User token (recommended for browser):**  
   `Authorization: Bearer <Firebase ID token>`  
   Same token FM already uses for authenticated API calls to Firebase-backed services.

2. **Server-to-server:** `api_key` in query/body + env `FIREBASE_ADMIN_BEARER_TOKEN` on AM server — only for trusted backend jobs; rotate tokens; not for browser exposure.

**GET**

| Query | Result |
|-------|--------|
| (none) | List manifests (AM caps page size) |
| `?id=<manifestDocId>` | Single manifest |
| `?trip_id=<tripDocId>` | Manifests where `trip_id` equals this value |

**POST** (`Content-Type: application/json`)

Link:

```json
{
  "action": "link_trip",
  "manifest_id": "<am_core_loadout_manifests doc id>",
  "trip_id": "<FM trip document id>",
  "trip_label": "Optional label",
  "id_token": "<optional if not using Authorization header>"
}
```

Unlink:

```json
{
  "action": "unlink_trip",
  "manifest_id": "<manifest doc id>"
}
```

**Response shape:** `{ "success": true, "manifest": { ... } }` or error JSON.

Full behavior is implemented in AM at: `web/api/loadout-manifests/index.php` (reference for error messages and edge cases).

---

## 4. Suggested FM product / UI edits

These are **suggestions** for the FM codebase (exact files depend on FM repo structure).

1. **Trip detail screen**
   - Section **“Load-out manifests (AM)”**.
   - On load: run Firestore query (Option A) or GET `?trip_id=<thisTrip.id>` (Option B).
   - Show table: `manifest_number`, `title`, `status`, `destination_site_label`, link **“Open in AM”** →  
     `https://am.1pwrafrica.com/loadout/view.php?id=<manifestDocId>` (opens read-only packing list / print).

2. **Link flow**
   - **Input:** manifest document ID (paste from AM) **or** search if you add an AM search API later.
   - **Action:** `updateDoc` on `am_core_loadout_manifests/{id}` with `trip_id: thisTrip.id` or POST `link_trip` to AM API.
   - **Unlink:** clear `trip_id` / `trip_label` as above.

3. **Trip model (optional, FM-only)**
   - Optional array `linkedManifestIds: string[]` on the trip doc for quick reverse lookup — **denormalized**; must be updated whenever linking/unlinking to avoid drift. Prefer **query by `trip_id` on manifests** as the single source of truth unless you need offline indexes.

4. **Permissions**
   - Restrict “Link/unlink” to FM roles that map to AM Manager+ (or hide behind Ops role).

---

## 5. AM reference implementation (counterpart repo)

Canonical implementation is in the **OneStop Asset Shop** repository (internal path often `1PWR AM` / `onestop-asset-shop`):

| Area | Path (AM repo) |
|------|----------------|
| Schema notes | `docs/FIRESTORE_SCHEMA.md` → `am_core_loadout_manifests` |
| Firestore rules | `firestore.rules` → `am_core_loadout_manifests` |
| AM UI | `web/loadout/*.php` |
| REST API | `web/api/loadout-manifests/index.php` |

---

## 6. Testing checklist for FM

- [ ] Query returns manifests after linking (`trip_id` matches trip `doc.id`).
- [ ] FM user with insufficient permission gets a clear error (rules).
- [ ] “Open in AM” opens the correct manifest in a new tab.
- [ ] Unlink removes manifest from trip query results.
- [ ] Optional: call AM GET with `trip_id` and compare to Firestore query (parity).

---

## 7. Open points (coordinate with AM / product)

- **Trip ID semantics:** Confirm FM trip primary key is Firestore `doc.id` everywhere.
- **Multi-manifest per trip:** Supported — multiple manifest docs may share the same `trip_id`.
- **Rules changes:** Any FM-specific role that is not “PR permissionLevel ≥ 3” will require a **Firestore rules** change in the shared project (do not deploy rules without cross-team review).

---

*Bump this doc when API or schema changes; align with AM `docs/FM_LOADOUT_MANIFEST_INTEGRATION.md` if both copies are kept.*
