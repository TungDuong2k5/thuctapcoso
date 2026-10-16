// Giao diện: chế độ sáng / tối và ảnh nền. Lưu trên trình duyệt (mỗi máy chọn riêng).
const KEY = 'taskflow-theme';

const bing = (id) => `https://th.bing.com/th/id/${id}?w=1920&h=1080&c=1&rs=1&pid=1.7`;
export const BACKGROUNDS = [
  { id: 'default', name: 'Mặc định', url: null },
  { id: 'bg1', name: 'Ảnh nền 1', url: bing('OIP.sqejIr04Jdnmps21wnRojQHaEo') },
  { id: 'bg2', name: 'Ảnh nền 2', url: bing('OIP.xlAA6HpL66tWKp42oIMYuQHaE1') },
  { id: 'bg3', name: 'Ảnh nền 3', url: bing('OIP.jdXNe31nHdNwWwXxcCOpAQHaEJ') },
  { id: 'bg4', name: 'Ảnh nền 4', url: bing('OIP.gnvK2FfM34SpM-B8m6r-yQHaFB') },
];

export function getTheme() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { mode: saved.mode === 'light' ? 'light' : 'dark', bg: BACKGROUNDS.some((b) => b.id === saved.bg) ? saved.bg : 'default' };
  } catch {
    return { mode: 'dark', bg: 'default' };
  }
}

// Áp dụng lên trang: <html data-theme="dark"> và ảnh nền của <body> (phủ lớp mờ cho dễ đọc chữ)
export function applyTheme(theme = getTheme()) {
  const root = document.documentElement;
  root.dataset.theme = theme.mode;
  const bg = BACKGROUNDS.find((b) => b.id === theme.bg);
  if (bg?.url) {
    const veil = theme.mode === 'dark' ? 'rgba(15, 23, 42, 0.62)' : 'rgba(255, 255, 255, 0.35)';
    document.body.style.backgroundImage = `linear-gradient(${veil}, ${veil}), url("${bg.url}")`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundAttachment = 'fixed';
    root.dataset.bg = 'image';
  } else {
    document.body.style.backgroundImage = '';
    document.body.style.backgroundSize = '';
    document.body.style.backgroundPosition = '';
    document.body.style.backgroundAttachment = '';
    delete root.dataset.bg;
  }
}

export function saveTheme(theme) {
  try { localStorage.setItem(KEY, JSON.stringify(theme)); } catch { /* trình duyệt chặn lưu trữ */ }
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent('taskflow:theme', { detail: theme }));
}
