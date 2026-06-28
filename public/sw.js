/*
 * Higgins service worker — conservative, auth-safe offline support.
 *
 * Strategy:
 *   - Navigations: network-first. On network failure, serve the cached
 *     offline page. Authenticated HTML/RSC is therefore NEVER served stale
 *     from cache — we only fall back to a generic offline screen.
 *   - Same-origin static assets (/_next/static, /icons, fonts, images):
 *     stale-while-revalidate for instant repeat loads.
 *   - Everything else (APIs, auth, cross-origin like Supabase/Mollie, and
 *     any non-GET request): passthrough to the network, never cached.
 *
 * Bump CACHE_VERSION to invalidate old caches on deploy.
 */

const CACHE_VERSION = "higgins-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const OFFLINE_URL = "/offline.html";

const PRECACHE = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/favicon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(PRECACHE);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/favicon.png" ||
    url.pathname === "/apple-touch-icon.png" ||
    /\.(?:css|js|woff2?|ttf|otf|png|jpg|jpeg|webp|svg|gif|ico)$/.test(
      url.pathname,
    )
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ever touch same-origin GETs. Auth/API and cross-origin
  // (Supabase, Mollie) always go straight to the network, uncached.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/_next/data/")
  ) {
    return;
  }

  // App navigations: network-first, fall back to the offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(STATIC_CACHE);
          const offline = await cache.match(OFFLINE_URL);
          return (
            offline ??
            new Response("Offline", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            })
          );
        }
      })(),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res && res.status === 200 && res.type === "basic") {
              cache.put(request, res.clone());
            }
            return res;
          })
          .catch(() => cached);
        return cached ?? network;
      })(),
    );
  }
});
