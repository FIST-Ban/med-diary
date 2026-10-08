/* 복약 다이어리 — 오프라인에서도 열리도록 앱 파일을 캐시한다.
 * 인터넷이 되면 항상 새 파일을 받고(수정한 내용이 바로 반영되도록),
 * 안 되면 마지막으로 받아 둔 파일을 쓴다. 기록 데이터는 여기와 무관하다(localStorage). */
const CACHE = 'med-diary-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './schedule.js',
  './app.js',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })),
  );
});
