const CACHE_NAME = "cat-eat-h5-v37-local-mode-ios";
// v1.1.4-hotfix-3: 升 v36-data-immediate → v37-local-mode-ios 强制刷掉老 SW 缓存。
// iPhone PWA / Safari 上 CloudBase 跨源 cookie 被 WKWebView ITP 拦截,
// FetchError undefined,云同步走不通。新版在 iOS 上把云同步卡片换成
// "本地模式"卡片,数据自动存本机 + 显眼的 iCloud Drive JSON 备份入口。
// Mac / Windows Chrome 不受影响,继续走云同步。
const APP_ASSETS = [
  "./?screen=home",
  "./preview.css?v=37",
  "./preview.js?v=37",
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
