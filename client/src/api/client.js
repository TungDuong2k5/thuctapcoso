import axios from 'axios';
import { io } from 'socket.io-client';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Token hết hạn → quay về trang đăng nhập
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const publicPages = ['/login', '/register', '/reset-password'];
    if (err.response?.status === 401 && !publicPages.includes(window.location.pathname)) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export const errMsg = (err) => {
  if (err.response?.data?.message) return err.response.data.message;
  // Không có phản hồi từ API (server tắt) → Vite proxy trả 500/502/504 không kèm message
  if (!err.response || err.response.status >= 500) {
    return 'Không kết nối được máy chủ. Hãy kiểm tra server API (cổng 5050) đã chạy chưa.';
  }
  return err.message;
};

// Tải file có kèm token (thẻ <a href> thường không gửi được header Authorization)
export async function downloadAttachment(att) {
  const res = await api.get(`/attachments/${att.id}/download`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = att.originalName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

let socket = null;

export function getSocket() {
  if (!socket) socket = io({ auth: { token: localStorage.getItem('token') } });
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}

export default api;
