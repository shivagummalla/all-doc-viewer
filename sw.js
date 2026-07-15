const CACHE = "all-doc-viewer-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/pdf.min.js",
  "./assets/pdf.worker.min.js",
  "./assets/mammoth.browser.min.js",
  "./assets/xlsx.min.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png"
];

const DB_NAME = "all-doc-viewer-db";
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("incoming")) {
        db.createObjectStore("incoming", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeIncoming(file) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("incoming", "readwrite");
    tx.objectStore("incoming").put({
      id: "pending",
      name: file.name,
      type: file.type,
      size: file.size,
      blob: file,
      addedAt: Date.now()
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Intercept the PWA share-target POST so shared files never hit the (static) network
  if (e.request.method === "POST" && url.pathname.endsWith("index.html")) {
    e.respondWith(handleShare(e.request));
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});

async function handleShare(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (file && file.size !== undefined) {
      await storeIncoming(file);
    }
  } catch (err) {
    // ignore malformed share payloads
  }
  return Response.redirect("./index.html?shared=1", 303);
}
