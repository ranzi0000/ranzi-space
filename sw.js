// Service Worker for ranzi.space
// 策略：
// - HTML（document）和 /api/*：永远走网络（避免登录态被缓存的坑，参考 principle_sw_html_caching_login_trap）
// - 静态资源（icons、manifest）：网络优先，失败回退缓存
const CACHE_NAME = 'ranzi-space-v1';

self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  // 同源 HTML 文档和 API：always network，不缓存
  var isDocument = req.destination === 'document' || req.mode === 'navigate';
  var isApi = url.pathname.startsWith('/api/') || url.pathname === '/__login' || url.pathname === '/__logout';

  if (isDocument || isApi) {
    event.respondWith(fetch(req).catch(function() { return caches.match(req); }));
    return;
  }

  // 其他（静态资源）：network-first，写缓存兜底
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req).then(function(resp) {
        if (resp && resp.status === 200) {
          var copy = resp.clone();
          caches.open(CACHE_NAME).then(function(c) { c.put(req, copy); });
        }
        return resp;
      }).catch(function() {
        return caches.match(req);
      })
    );
  }
});
