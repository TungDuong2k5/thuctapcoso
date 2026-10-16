import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import api, { getSocket } from '../api/client';

// Thông báo khẩn: hết hạn hôm nay / quá hạn mà chưa hoàn thành
export const URGENT_TYPES = ['deadline_today', 'deadline_overdue'];
const isUrgent = (n) => URGENT_TYPES.includes(n.type);

// Tiếng "bíp" ngắn khi có thông báo khẩn mới (trình duyệt có thể chặn nếu chưa bấm vào trang)
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25].forEach((t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.2);
    });
  } catch { /* không phát được thì thôi */ }
}

export default function NotificationBell() {
  const [data, setData] = useState({ items: [], unread: 0 });
  const [urgent, setUrgent] = useState([]);
  const [showAlert, setShowAlert] = useState(false);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/notifications').then((res) => {
      setData(res.data);
      setUrgent(res.data.urgent || []);
      // Mỗi lần mở web (mỗi phiên) bật cảnh báo nếu còn việc khẩn chưa xem
      if (res.data.urgent?.length && sessionStorage.getItem('urgentSeen') !== String(res.data.urgent[0].id)) {
        setShowAlert(true);
      }
    }).catch(() => {});
    const socket = getSocket();
    const onNew = (n) => {
      setData((d) => ({ items: [n, ...d.items].slice(0, 30), unread: d.unread + 1 }));
      if (isUrgent(n)) {
        setUrgent((u) => [n, ...u]);
        setShowAlert(true);
        beep();
      }
    };
    // Việc đã nộp / đã xong hoặc dự án đã hoàn thành → máy chủ tắt các thông báo khẩn liên quan
    const onResolved = ({ ids }) => {
      setUrgent((u) => {
        const left = u.filter((x) => !ids.includes(x.id));
        if (!left.length) setShowAlert(false);
        return left;
      });
      setData((d) => ({
        items: d.items.map((x) => (ids.includes(x.id) ? { ...x, isRead: true } : x)),
        unread: Math.max(0, d.unread - d.items.filter((x) => ids.includes(x.id) && !x.isRead).length),
      }));
    };
    socket.on('notification:new', onNew);
    socket.on('notification:resolved', onResolved);
    return () => {
      socket.off('notification:new', onNew);
      socket.off('notification:resolved', onResolved);
    };
  }, []);

  // Còn thông báo khẩn chưa đọc → tiêu đề tab nhấp nháy dấu (!)
  useEffect(() => {
    const base = document.title.replace(/^\(!\) /, '');
    document.title = urgent.length ? `(!) ${base}` : base;
  }, [urgent.length]);

  const markRead = (ids) => {
    setData((d) => ({
      items: d.items.map((x) => (ids.includes(x.id) ? { ...x, isRead: true } : x)),
      unread: Math.max(0, d.unread - d.items.filter((x) => ids.includes(x.id) && !x.isRead).length),
    }));
    setUrgent((u) => u.filter((x) => !ids.includes(x.id)));
  };

  const markAll = async () => {
    await api.patch('/notifications/read');
    setData((d) => ({ items: d.items.map((n) => ({ ...n, isRead: true })), unread: 0 }));
    setUrgent([]);
    setShowAlert(false);
  };

  const openItem = async (n) => {
    if (!n.isRead) {
      await api.patch(`/notifications/${n.id}/read`);
      markRead([n.id]);
    }
    setOpen(false);
    setShowAlert(false);
    if (n.link) navigate(n.link);
  };

  const later = () => {
    if (urgent[0]) sessionStorage.setItem('urgentSeen', String(urgent[0].id));
    setShowAlert(false);
  };

  return (
    <div className="bell">
      <button type="button" className={`btn ghost ${urgent.length ? 'bell-urgent' : ''}`} onClick={() => setOpen(!open)}>
        {urgent.length > 0 && '🚨 '}Thông báo {data.unread > 0 && <span className="badge">{data.unread}</span>}
      </button>
      {open && (
        <div className="dropdown">
          <div className="dropdown-head">
            <strong>Thông báo</strong>
            <button type="button" className="link" onClick={markAll}>Đánh dấu đã đọc</button>
          </div>
          {data.items.length === 0 && <p className="muted pad">Chưa có thông báo</p>}
          {data.items.map((n) => (
            <button
              type="button"
              key={n.id}
              className={`notif ${n.isRead ? '' : 'unread'} ${isUrgent(n) ? 'urgent' : ''}`}
              onClick={() => openItem(n)}
            >
              <span>{n.message}</span>
              <small className="muted">{new Date(n.createdAt).toLocaleString('vi-VN')}</small>
            </button>
          ))}
        </div>
      )}

      {/* Gắn thẳng vào <body>: nằm trong thanh trên cùng (có backdrop-filter) thì bị giới hạn trong thanh đó */}
      {showAlert && urgent.length > 0 && createPortal(
        <div className="modal-backdrop urgent-backdrop">
          <div className="modal urgent-modal" role="alertdialog" aria-labelledby="urgent-title">
            <h3 id="urgent-title">🚨 Thông báo khẩn – công việc đến hạn / quá hạn</h3>
            <p className="muted small">Các công việc dưới đây đã đến hạn hoặc quá hạn mà chưa hoàn thành. Bấm vào từng việc để xử lý.</p>
            <div className="urgent-list">
              {urgent.slice(0, 8).map((n) => (
                <button type="button" key={n.id} className="urgent-item" onClick={() => openItem(n)}>
                  <span>{n.message.replace(/^🚨\s*/, '')}</span>
                  <small>{new Date(n.createdAt).toLocaleString('vi-VN')} · Xem ngay →</small>
                </button>
              ))}
              {urgent.length > 8 && <p className="small muted">… và {urgent.length - 8} thông báo khẩn khác trong mục Thông báo</p>}
            </div>
            <div className="row end">
              <button type="button" className="btn ghost" onClick={later}>Để sau</button>
              <button type="button" className="btn danger" onClick={() => openItem(urgent[0])}>Xử lý việc đầu tiên</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
