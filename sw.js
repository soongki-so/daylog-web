// DayLog service worker — 네트워크 우선, 실패 시 캐시 (오프라인에서도 앱 껍데기 열림)
const CACHE = 'daylog-v36';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/db.js', './js/store.js', './js/date.js', './js/defaults.js', './js/config.js', './js/sync.js', './js/events.js', './js/classes.js', './js/complete.js', './js/avatar.js', './js/views/avatar.js',
  './js/ui.js', './js/charts.js', './js/foods.js', './js/inbody.js', './js/meds.js', './js/health.js', './js/views/injection.js',
  './js/views/today.js', './js/views/calendar.js', './js/views/trends.js', './js/views/settings.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // cache: 'no-cache' = 브라우저 HTTP 캐시를 믿지 않고 서버에 "바뀌었나요?" 확인(304면 빠름).
  // 이게 없으면 호스팅의 캐시 헤더 때문에 새 js 를 올려도 한동안 옛 파일이 쓰일 수 있다.
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
