const CACHE = "gamevault-v1";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./apple-touch-icon.png", "./icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(CORE.map((u) => cache.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function remember(req, res) {
  if (res && (res.ok || res.type === "opaque")) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const library = (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/"))
    || url.hostname === "cdn.jsdelivr.net";

  if (sameOrigin) {
    // reseau d'abord (pour recevoir les mises a jour), sinon la copie gardee
    event.respondWith((async () => {
      const cached = () => caches.match(req, { ignoreSearch: true })
        .then((r) => r || caches.match("./index.html"));
      try {
        const res = await Promise.race([
          fetch(req),
          new Promise((_, rej) => setTimeout(() => rej(new Error("lent")), 5000)),
        ]);
        return remember(req, res);
      } catch (e) {
        const hit = await cached();
        return hit || fetch(req);
      }
    })());
  } else if (library) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => remember(req, res))));
  }
});