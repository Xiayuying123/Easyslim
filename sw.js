const CACHE_NAME = 'weight-loss-tracker-v38';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js?v=38',
  './js/food_db.js',
  './js/recipes.js',
  './logo.svg',
  './manifest.json'
];

// 安装 Service Worker，缓存静态资源
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 激活并清理旧缓存
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 拦截请求并实现缓存策略
self.addEventListener('fetch', (e) => {
  // 1. 对 HTML/导航请求使用网络优先 (Network-First) 策略，防止页面内容和缓存锁死
  const isHtml = e.request.mode === 'navigate' || 
                 e.request.url.endsWith('.html') || 
                 e.request.url === self.location.origin + '/' ||
                 e.request.url.endsWith('/');
                 
  if (isHtml) {
    e.respondWith(
      fetch(e.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, clone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(e.request);
        })
    );
    return;
  }

  // 2. 对其他静态资源使用缓存优先并在后台自动更新 (Stale-While-Revalidate) 策略
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(e.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, networkResponse);
            });
          }
        }).catch(() => {/* 忽略离线fetch失败 */});
        
        return cachedResponse;
      }
      return fetch(e.request);
    })
  );
});
