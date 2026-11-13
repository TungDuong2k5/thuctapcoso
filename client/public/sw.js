// Service worker của ứng dụng TaskFlow (PWA)
// - Trang (điều hướng): lấy mới từ máy chủ, mất mạng thì mở bản đã lưu để app vẫn khởi động được
// - File tĩnh đã đóng gói (/assets/…, icon): lưu lại, lần sau mở nhanh hơn
// - API, Socket.IO, file tải lên: KHÔNG lưu, luôn lấy dữ liệu mới
const CACHE = 'taskflow-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/favicon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io') || url.pathname.startsWith('/uploads')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('/', copy));
        return res;
      })
      .catch(() => caches.match('/')));
    return;
  }

  const isStatic = url.pathname.startsWith('/assets/') || /\.(png|svg|ico|webmanifest)$/.test(url.pathname);
  if (!isStatic) return;
  event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
    }
    return res;
  })));
});
