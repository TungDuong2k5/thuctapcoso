import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import api, { errMsg, getSocket } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';

const ROLE = { leader: 'Trưởng nhóm', member: 'Thành viên' };
const time = (d) => new Date(d).toLocaleString('vi-VN', {
  hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
});

// Biểu tượng nhắn riêng trong chi tiết công việc: ảnh đại diện + 💬 của từng người liên quan.
// Bấm vào một người để mở khung nhắn tin 1–1 với người đó về công việc này.
export default function DirectMessages({ task, readOnly }) {
  const [contacts, setContacts] = useState([]);
  const [params, setParams] = useSearchParams();
  const openId = Number(params.get('dm')) || null;
  const { user } = useAuth();

  const load = useCallback(() => {
    api.get(`/tasks/${task.id}/dm`).then((res) => setContacts(res.data)).catch(() => setContacts([]));
  }, [task.id]);

  useEffect(() => { load(); }, [load]);

  // Có tin nhắn riêng mới về công việc này → cập nhật số chưa đọc
  useEffect(() => {
    const socket = getSocket();
    const onNew = (m) => {
      if (m.taskId !== task.id || m.senderId === user.id) return;
      if (m.senderId === openId) return; // đang mở đúng khung chat → không tính chưa đọc
      setContacts((list) => list.map((c) => (c.id === m.senderId ? { ...c, unread: c.unread + 1 } : c)));
    };
    socket.on('dm:new', onNew);
    return () => socket.off('dm:new', onNew);
  }, [task.id, openId, user.id]);

  const setOpen = (id) => setParams((p) => {
    const next = new URLSearchParams(p);
    if (id) next.set('dm', id); else next.delete('dm');
    return next;
  });

  if (readOnly || contacts.length === 0) return null;
  const current = contacts.find((c) => c.id === openId);

  return (
    <>
      <div className="dm-icons" aria-label="Nhắn tin riêng">
        <span className="dm-label" title="Nhắn tin riêng với người liên quan đến công việc này">💬</span>
        {contacts.map((c) => (
          <button
            type="button"
            key={c.id}
            className={`dm-icon ${openId === c.id ? 'active' : ''}`}
            title={`Nhắn riêng cho ${c.fullName} (${c.isAssignee ? 'người làm' : ROLE[c.role] || ''})`}
            onClick={() => setOpen(openId === c.id ? null : c.id)}
          >
            <Avatar name={c.fullName} src={c.avatarUrl} size={28} />
            {c.unread > 0 && <i className="dm-badge">{c.unread}</i>}
          </button>
        ))}
      </div>
      {current && (
        <DmChat
          task={task}
          other={current}
          onClose={() => setOpen(null)}
          onRead={() => setContacts((list) => list.map((c) => (c.id === current.id ? { ...c, unread: 0 } : c)))}
        />
      )}
    </>
  );
}

function DmChat({
  task, other, onClose, onRead,
}) {
  const { user } = useAuth();
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    setMessages(null);
    api.get(`/tasks/${task.id}/dm/${other.id}`)
      .then((res) => { setMessages(res.data); onRead(); })
      .catch((err) => setError(errMsg(err)));
    const socket = getSocket();
    const onNew = (m) => {
      const inThread = m.taskId === task.id
        && ((m.senderId === other.id && m.receiverId === user.id) || (m.senderId === user.id && m.receiverId === other.id));
      if (!inThread) return;
      setMessages((list) => (list && !list.some((x) => x.id === m.id) ? [...list, m] : list));
      if (m.senderId === other.id) api.get(`/tasks/${task.id}/dm/${other.id}`).catch(() => {}); // đánh dấu đã đọc
    };
    socket.on('dm:new', onNew);
    return () => socket.off('dm:new', onNew);
  }, [task.id, other.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.post(`/tasks/${task.id}/dm/${other.id}`, { content: text });
      setMessages((list) => (list.some((x) => x.id === res.data.id) ? list : [...list, res.data]));
      setText('');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  // Gắn thẳng vào <body> để nổi trên khung chi tiết công việc và không bị nút gọi / chat che
  return createPortal(
    <div className="dm-chat" role="dialog" aria-label={`Nhắn riêng với ${other.fullName}`}>
      <div className="dm-head">
        <Avatar name={other.fullName} src={other.avatarUrl} size={30} />
        <div className="grow">
          <strong>{other.fullName}</strong>
          <small className="muted">Nhắn riêng · {task.title}</small>
        </div>
        <button type="button" className="float-close" onClick={onClose} title="Đóng">×</button>
      </div>
      <div className="dm-list">
        {messages === null && !error && <p className="muted small center">Đang tải...</p>}
        {messages?.length === 0 && <p className="muted small center">Chưa có tin nhắn. Chỉ bạn và {other.fullName} thấy cuộc trò chuyện này.</p>}
        {messages?.map((m) => (
          <div key={m.id} className={`dm-msg ${m.senderId === user.id ? 'mine' : ''}`}>
            <div className="pre-line">{m.content}</div>
            <small>{time(m.createdAt)}{m.senderId === user.id && m.readAt ? ' · Đã xem' : ''}</small>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {error && <div className="alert small">{error}</div>}
      <form className="dm-form" onSubmit={send}>
        <input placeholder={`Nhắn cho ${other.fullName}…`} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn primary" disabled={!text.trim() || busy}>Gửi</button>
      </form>
    </div>,
    document.body,
  );
}
