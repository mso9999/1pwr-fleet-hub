# PWA + offline queue (plan)

Spec §10.1 targets: cache vehicle list and open work orders; allow check-in/out and inspections offline with sync when online.

## Current state (implemented)

- `app/manifest.ts` — installable web app metadata (name, theme, icon).
- `public/sw.js` — minimal **stale-while-revalidate** caching for same-origin GET pages (not API routes). Improves repeat loads on poor connectivity; does **not** queue writes.
- `ServiceWorkerRegister` — registers the worker in **production** only.

## Next steps (when online workflows are stable)

1. **Do not cache `/api/*`** in the service worker (already skipped) — avoid serving stale JSON.
2. **IndexedDB queue** — table of pending mutations: `{ id, type: 'checkout'|'inspection'|'wo-update', payload, createdAt }` with exponential backoff sync.
3. **Background sync** — `navigator.serviceWorker.ready` + `registration.sync.register('fleet-sync')` where supported; fallback to `online` event + `visibilitychange`.
4. **Conflict policy** — last-write-wins for notes; server validation for ODO monotonicity.
5. **UI** — banner “Pending offline actions: N” and retry/discard controls.

## Testing

- Use Chrome DevTools → Application → Service Workers and “Offline” throttle.
- Validate that API calls fail fast offline and queued items appear in IndexedDB (once implemented).
