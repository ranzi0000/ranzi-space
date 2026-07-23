// Service Worker for ranzi.space
// 策略：
// - HTML（document）和 /api/*：永远走网络（避免登录态被缓存的坑，参考 principle_sw_html_caching_login_trap）
// - 静态资源（icons、manifest）：网络优先，失败回退缓存
const CACHE_NAME = 'ranzi-space-v2';

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
    event.respondWith(
      fetch(req).catch(function() {
        // 网络失败：先试缓存（HTML 通常没缓存），都没有就返回兜底页而非 null
        return caches.match(req).then(function(cached) {
          if (cached) return cached;
          return new Response(
            '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<body style="font-family:system-ui;background:#111;color:#aaa;padding:3em 1.5em;text-align:center">' +
            '<p style="font-size:1.1em">网络暂时连不上 ranzi.space</p>' +
            '<p style="color:#666;font-size:.9em">可能是 DNS 被临时污染，稍等或换个网络后重试</p>' +
            '<p><a href="javascript:location.reload()" style="color:#c0642e">重新加载</a></p></body>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        });
      })
    );
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
        return caches.match(req).then(function(cached) {
          return cached || new Response('', { status: 504, statusText: 'offline' });
        });
      })
    );
  }
});
