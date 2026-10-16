import { useEffect, useRef, useState } from 'react';
import api, { errMsg, getSocket } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';

const time = (d) => new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const day = (d) => new Date(d).toLocaleDateString('vi-VN');

// Phòng trò chuyện chung của dự án (realtime qua Socket.IO)
export default function ChatTab({ project, isGuest, visible = true }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const stickBottom = useRef(true);

  useEffect(() => {
    api.get(`/projects/${project.id}/messages`).then((res) => {
      setMessages(res.data.items);
      setHasMore(res.data.hasMore);
    }).catch((err) => setError(errMsg(err)));

    const socket = getSocket();
    const onNew = (m) => {
      if (m.projectId !== project.id) return;
      setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
    };
    socket.on('chat:new', onNew);
    return () => socket.off('chat:new', onNew);
  }, [project.id]);

  // Tự cuộn xuống tin mới nhất (trừ khi đang cuộn lên đọc tin cũ)
  useEffect(() => {
    const el = listRef.current;
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Mở khung chat → cuộn xuống tin mới nhất
  useEffect(() => {
    const el = listRef.current;
    if (visible && el) {
      stickBottom.current = true;
      el.scrollTop = el.scrollHeight;
    }
  }, [visible]);

  const onScroll = () => {
    const el = listRef.current;
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const loadOlder = async () => {
    const el = listRef.current;
    const prevHeight = el.scrollHeight;
    const res = await api.get(`/projects/${project.id}/messages`, { params: { before: messages[0]?.id } });
    stickBottom.current = false;
    setMessages((list) => [...res.data.items, ...list]);
    setHasMore(res.data.hasMore);
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - prevHeight; });
  };

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setError('');
    setSending(true);
    try {
      const res = await api.post(`/projects/${project.id}/messages`, { content: text });
      stickBottom.current = true;
      setMessages((list) => (list.some((x) => x.id === res.data.id) ? list : [...list, res.data]));
      setText('');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card chat">
      <div className="chat-head">
        <strong>💬 Trò chuyện nhóm</strong>
        <small className="muted">{project.members.length} thành viên · tin nhắn hiện ngay cho cả nhóm</small>
      </div>
      <div className="chat-list" ref={listRef} onScroll={onScroll}>
        {hasMore && <button type="button" className="link small chat-older" onClick={loadOlder}>Tải tin nhắn cũ hơn</button>}
        {messages.length === 0 && <p className="muted center">Chưa có tin nhắn nào. Hãy gửi lời chào đến cả nhóm!</p>}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const mine = m.userId === user.id;
          const newDay = !prev || day(prev.createdAt) !== day(m.createdAt);
          const grouped = !newDay && prev && prev.userId === m.userId && new Date(m.createdAt) - new Date(prev.createdAt) < 5 * 60 * 1000;
          return (
            <div key={m.id}>
              {newDay && <div className="chat-day">{day(m.createdAt)}</div>}
              <div className={`chat-row ${mine ? 'mine' : ''} ${grouped ? 'grouped' : ''}`}>
                {!mine && (grouped ? <span className="chat-avatar-space" /> : <Avatar name={m.author?.fullName} src={m.author?.avatarUrl} size={30} />)}
                <div className="chat-bubble-wrap">
                  {!mine && !grouped && <div className="chat-name">{m.author?.fullName || 'Người dùng đã xóa'}</div>}
                  <div className="chat-bubble" title={new Date(m.createdAt).toLocaleString('vi-VN')}>
                    <span className="pre-line">{m.content}</span>
                    <small>{time(m.createdAt)}</small>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {error && <div className="alert">{error}</div>}
      {isGuest ? (
        <p className="muted small center">Bạn là khách của dự án nên chỉ xem được tin nhắn.</p>
      ) : (
        <form className="chat-form" onSubmit={send}>
          <textarea
            rows={1}
            maxLength={2000}
            placeholder="Nhập tin nhắn… (Enter để gửi, Shift + Enter xuống dòng)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); }}
          />
          <button type="submit" className="btn primary" disabled={!text.trim() || sending}>Gửi</button>
        </form>
      )}
    </div>
  );
}
