const VERSION = "20260607-5";
const CACHE_NAME = "lao-dictionary-v" + VERSION;
const VERSION_QUERY = "?v=" + VERSION;
const ASSETS = [
  "./index.html" + VERSION_QUERY,
  "./style.css" + VERSION_QUERY,
  "./app.js" + VERSION_QUERY,
  "./data-store.js" + VERSION_QUERY,
  "./phonetic-glyphs.js" + VERSION_QUERY,
  "./manifest.json" + VERSION_QUERY,
  "./manifest.webmanifest" + VERSION_QUERY,
  "./icon.svg" + VERSION_QUERY,
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];
const NETWORK_FIRST_FILES = new Set([
  "",
  "index.html",
  "app.js",
  "style.css",
  "data-store.js",
  "phonetic-glyphs.js",
  "manifest.json",
  "manifest.webmanifest",
  "service-worker.js",
]);

function fileName(url) {
  const path = new URL(url).pathname;
  return path.slice(path.lastIndexOf("/") + 1);
}

function versionHtml(html) {
  const replaceVersion = (file) => {
    const escapedFile = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(
      new RegExp("(\\./" + escapedFile + ")(?:\\?[^\"']*)?([\"'])", "g"),
      "$1" + VERSION_QUERY + "$2"
    );
  };
  replaceVersion("style.css");
  replaceVersion("app.js");
  replaceVersion("data-store.js");
  replaceVersion("phonetic-glyphs.js");
  replaceVersion("manifest.json");
  replaceVersion("manifest.webmanifest");
  replaceVersion("icon.svg");
  replaceVersion("apple-touch-icon.png");
  replaceVersion("icon-192.png");
  replaceVersion("icon-512.png");
  html = html
    .replace(/<title>日本語ラオス語辞書<\/title>/g, "<title>ラオス語辞書</title>")
    .replace(/(<h1>)日本語ラオス語辞書(<\/h1>)/g, "$1ラオス語辞書$2")
    .replace(/(<meta name="apple-mobile-web-app-title" content=")日本語ラオス語辞書(")/g, "$1ラオス語辞書$2")
    .replace(/(<meta name="apple-mobile-web-app-title" content=")ラオス語辞書(")/g, "$1ラオス語辞書$2");
  html = html
    .replace(/<link rel="manifest" href="\.\/manifest\.json(?:\?[^"]*)?">/g, '<link rel="manifest" href="./manifest.webmanifest' + VERSION_QUERY + '">')
    .replace(/<link rel="apple-touch-icon" href="\.\/[^"]+">/g, '<link rel="apple-touch-icon" href="./apple-touch-icon.png' + VERSION_QUERY + '">');
  if (!html.includes("serviceWorker.ready.then")) {
    html = html.replace(
      "</body>",
      '<script>if ("serviceWorker" in navigator) navigator.serviceWorker.ready.then((reg) => reg.update()).catch(() => {});</script></body>'
    );
  }
  return html;
}

async function prepareResponse(response, request) {
  if (!response || !response.ok || (fileName(request.url) !== "index.html" && request.mode !== "navigate")) return response;
  const headers = new Headers(response.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  return new Response(versionHtml(await response.text()), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await prepareResponse(await fetch(request), request);
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (
      await cache.match(request, { ignoreSearch: true }) ||
      (request.mode === "navigate" ? await cache.match("./index.html" + VERSION_QUERY) : undefined) ||
      Response.error()
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && (key.startsWith("lao-dictionary-") || key.startsWith("lao-dictionary-pwa-")))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    event.request.mode === "navigate" || NETWORK_FIRST_FILES.has(fileName(url))
      ? networkFirst(event.request)
      : cacheFirst(event.request)
  );
});
