const CACHE_NAME = "cat-eat-h5-v36-data-immediate";
// v1.1.4-hotfix-2: 升 v35-skeleton → v36-data-immediate 强制刷掉老 data-store.js。
// v35-skeleton 里有 runTransaction 修复,但 tryInitialize 还在 await cloudSync.start(),
// 22 条 outbox 串行 flush 把 bootstrap 拉慢到 5+ 秒,user 刷新后看到 "Hi 噜噜 还没有
// 最近记录" 骨架 5+ 秒误以为 "刷新丢数据"。v36 把 cloudSync.start 改 fire-and-forget,
// service.initialize 完就 resolve,数据立即可见。
const APP_ASSETS = [
  "./?screen=home",
  "./preview.css?v=36",
  "./preview.js?v=36",
  "./utils/rules.js",
  "./utils/cloudbase-config.js",
  "./utils/cloudbase-sdk.js",
  "./utils/data-store.js",
  "./manifest.webmanifest",
  "./assets/cat-profile-default.jpg",
  "./assets/icons/phosphor-cat-thin.svg",
  "./assets/icons/phosphor-cylinder-light.svg",
  "./assets/icons/ddmc-home.svg",
  "./assets/icons/ddmc-add.svg",
  "./assets/icons/ddmc-camera.svg",
  "./assets/icons/ddmc-list.svg",
  "./assets/icons/ddmc-box.svg",
  "./assets/icons/ddmc-heart.svg",
  "./assets/icons/ddmc-check.svg",
  "./assets/icons/ddmc-warning.svg",
  "./assets/icons/ddmc-eye.svg",
  "./assets/icons/ddmc-back.svg",
  "./assets/icons/ddmc-search.svg",
  "./assets/icons/ddmc-clock.svg",
  "./assets/icons/app-icon-192.png",
  "./assets/icons/app-icon-512.png",
  "./assets/icons/nav-home-active.svg",
  "./assets/icons/nav-home-default.svg",
  "./assets/icons/nav-add-active.svg",
  "./assets/icons/nav-add-default.svg",
  "./assets/icons/nav-can-active.svg",
  "./assets/icons/nav-can-default.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((response) => response || caches.match("./?screen=home")))
  );
});
