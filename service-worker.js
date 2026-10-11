const CACHE_NAME = "billionaire-mindset-shell-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./about.html",
  "./faq.html",
  "./offline.html",
  "./site.css",
  "./app.js",
  "./pwa.js",
  "./manifest.webmanifest",
  "./apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./logo-gold.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith("billionaire-mindset-shell-") && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => response)
        .catch(async () => {
          const cachedPage = await caches.match(request);
          return cachedPage || caches.match("./offline.html");
        })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cachedAsset = await caches.match(request);
        if (cachedAsset) return cachedAsset;
        return new Response("", { status: 503, statusText: "Offline" });
      })
  );
});
