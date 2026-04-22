/**
 * Service worker served at /sw.js.
 *
 * We render it from a Next route so the build commit can be embedded. That gives every
 * deploy a fresh cache key (existing clients' `activate` event purges the old cache) and
 * a network-first fetch handler for HTML navigations so new deploys propagate immediately.
 * Hashed `/_next/static/*` assets stay cache-first because their filenames change on
 * content change (content-addressed).
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
  const commit = process.env.NEXT_PUBLIC_APP_COMMIT ?? "dev";
  const buildTime = process.env.NEXT_PUBLIC_APP_BUILD_TIME ?? "";
  const buildId = `${version}+${commit}`;

  const body = `/* 1PWR Fleet Hub service worker · ${buildId} · ${buildTime} */
const BUILD_ID = ${JSON.stringify(buildId)};
const CACHE = "fleet-hub-shell-" + BUILD_ID;

self.addEventListener("install", (event) => {
  // Take over from the previous SW immediately on the next activate.
  self.skipWaiting();
  // No precache: we want HTML navigations to always revalidate via the network.
  event.waitUntil(caches.open(CACHE));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(async () => {
        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const c of clients) c.postMessage({ type: "NEW_VERSION", buildId: BUILD_ID });
      })
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function isHtmlRequest(request) {
  if (request.mode === "navigate") return true;
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

function isHashedStatic(url) {
  // Next.js content-hashes everything under /_next/static, so we can cache-first safely.
  return url.pathname.startsWith("/_next/static/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Hashed static assets: cache-first, fall back to network.
  if (isHashedStatic(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  // HTML navigations: network-first, fall back to cache only on offline.
  if (isHtmlRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request).then((c) => c || caches.match("/")))
    );
    return;
  }

  // Everything else: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Service-Worker-Allowed": "/",
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}
