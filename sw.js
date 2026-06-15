const CACHE_NAME = 'weight-loss-tracker-v25';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js?v=25',
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

// 拦截请求并实现离线缓存优先策略
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        // 后台异步更新，以保证内容最新
        fetch(e.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
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
