// Ứng dụng cài được (PWA): đăng ký service worker và bắt sự kiện "có thể cài đặt" của trình duyệt
let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

export const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const canInstall = () => Boolean(deferred) && !isInstalled();

export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Hiện hộp thoại cài đặt của trình duyệt; trả về true nếu người dùng đồng ý
export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  notify();
  return outcome === 'accepted';
}

export function setupPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // tự hiện nút "Cài ứng dụng" thay cho thanh gợi ý mặc định
    deferred = e;
    notify();
  });
  window.addEventListener('appinstalled', () => { deferred = null; notify(); });
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* trình duyệt không hỗ trợ / không phải https */ });
    });
  }
}
