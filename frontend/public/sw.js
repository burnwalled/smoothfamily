// Offline (#51): the app shell is kept so the app opens without a connection. Pages are fetched
// from the network first (so a new version shows at once) and come from the cache only offline;
// Next's hashed static files are cached for good. The API is never cached here – the app's own
// read cache and outbox handle data (lib/queryClient.ts, lib/outbox.ts).
const SHELL = "sf-shell-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("sf-shell-") && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Shared to Smooth Family from another app (Android, 2.8.4): the file waits in a cache of its own
// until the vault page picks it up – it never leaves the phone before the member chooses.
const SHARED = "sf-shared";

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const target = new URL(request.url);
  if (request.method === "POST" && target.origin === self.location.origin && target.pathname === "/share-receive") {
    event.respondWith(
      (async () => {
        const form = await request.formData();
        const file = form.get("file");
        const cache = await caches.open(SHARED);
        await cache.delete("/shared-file");
        if (file && typeof file !== "string") {
          await cache.put("/shared-file", new Response(file, { headers: { "Content-Type": file.type || "application/octet-stream", "X-Name": encodeURIComponent(file.name || "shared") } }));
        }
        return Response.redirect("/vault/receive", 303);
      })()
    );
    return;
  }
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.open(SHELL).then((cache) => cache.match(request).then((hit) => hit || cache.match("/"))))
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|webmanifest|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(SHELL).then((cache) =>
        cache.match(request).then(
          (hit) =>
            hit ||
            fetch(request).then((response) => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            })
        )
      )
    );
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "Smooth Family", body: "", route: "/" };
  try {
    const payload = event.data ? event.data.json() : {};
    data = {
      title: payload.title || "Smooth Family",
      body: payload.body || "",
      route: payload.route || "/",
    };
  } catch {
    // Keep fallback notification payload if parsing fails.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-64.png",
      data: { route: data.route },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const route = (event.notification.data && event.notification.data.route) || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.postMessage({ type: "navigate", route });
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(route);
      }
      return undefined;
    })
  );
});
