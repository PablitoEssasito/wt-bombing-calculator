// Deliberately hand-rolled rather than a library (next-pwa and friends don't
// have a settled story for App Router + Turbopack + `output: "export"` yet —
// see AGENTS.md on this Next version not matching what most guides assume).
//
// Strategy, and why: this tool's whole premise is being opened on a phone
// mid-match-loading-screen, often on a poor connection — the "Zrobione" list
// says so outright. A page you've already opened once online should keep
// working when the signal drops, without ever serving stale content to
// someone who *is* online. That rules out precaching everything up front
// (downloads the whole site before it's wanted, and static export's
// content-hashed build output changes every deploy, so a hand-maintained
// precache list would go stale) in favour of caching opportunistically as
// pages are visited, with the network always preferred when it's reachable.
const CACHE_NAME = "wtbc-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Writing to the cache happens after `respondWith` has already resolved with
// the response, so it has to be threaded through `event.waitUntil` — without
// that, the browser is free to tear the service worker down the moment the
// page has its response, before the (un-awaited) cache.put ever runs.
const putInCache = (event, request, response) => {
  const copy = response.clone();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
  return response;
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // A real page load — network first, so anyone online always gets the
  // current build; only reach for the cache if the network is unreachable.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => putInCache(event, request, response))
        .catch(() => caches.match(request)),
    );
    return;
  }

  // Static, content-hashed build output — a content change always gets a new
  // URL, so whatever's cached under an old one is safe to keep indefinitely.
  if (/\/_next\/static\/|\.(?:png|svg|webp|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches
        .match(request)
        .then((cached) => cached ?? fetch(request).then((response) => putInCache(event, request, response))),
    );
    return;
  }

  // Everything else this app fetches same-origin (client-navigation payloads,
  // manifest, etc.) — serve what's cached immediately if there is anything,
  // and refresh it in the background for next time.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => putInCache(event, request, response))
        .catch(() => cached);
      return cached ?? network;
    }),
  );
});
