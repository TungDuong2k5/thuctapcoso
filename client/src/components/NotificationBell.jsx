import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { getSocket } from '../api/client';

export default function NotificationBell() {
  const [data, setData] = useState({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/notifications').then((res) => setData(res.data)).catch(() => {});
    const socket = getSocket();
    const onNew = (n) => setData((d) => ({ items: [n, ...d.items].slice(0, 30), unread: d.unread + 1 }));
    socket.on('notification:new', onNew);
    return () => socket.off('notification:new', onNew);
  }, []);

  const markAll = async () => {
    await api.patch('/notifications/read');
    setData((d) => ({ items: d.items.map((n) => ({ ...n, isRead: true })), unread: 0 }));
  };

  const openItem = async (n) => {
    if (!n.isRead) {
      await api.patch(`/notifications/${n.id}/read`);
      setData((d) => ({
        items: d.items.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)),
        unread: Math.max(0, d.unread - 1),
      }));
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <div className="bell">
      <button type="button" className="btn ghost" onClick={() => setOpen(!open)}>
        Thông báo {data.unread > 0 && <span className="badge">{data.unread}</span>}
      </button>
      {open && (
        <div className="dropdown">
          <div className="dropdown-head">
            <strong>Thông báo</strong>
            <button type="button" className="link" onClick={markAll}>Đánh dấu đã đọc</button>
          </div>
          {data.items.length === 0 && <p className="muted pad">Chưa có thông báo</p>}
          {data.items.map((n) => (
            <button type="button" key={n.id} className={`notif ${n.isRead ? '' : 'unread'}`} onClick={() => openItem(n)}>
              <span>{n.message}</span>
              <small className="muted">{new Date(n.createdAt).toLocaleString('vi-VN')}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
