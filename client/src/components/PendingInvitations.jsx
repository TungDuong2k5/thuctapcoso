import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errMsg, getSocket } from '../api/client';

// Khung "Lời mời tham gia dự án" ở trang Dự án của tôi: bấm Tham gia hoặc Từ chối
export default function PendingInvitations({ onJoined }) {
  const [invites, setInvites] = useState([]);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = useCallback(() => {
    api.get('/invitations/mine').then((res) => setInvites(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    // có lời mời mới (thông báo realtime) thì tải lại danh sách
    const socket = getSocket();
    const onNotif = (n) => n.type === 'project_invite' && load();
    socket.on('notification:new', onNotif);
    return () => socket.off('notification:new', onNotif);
  }, [load]);

  const answer = async (inv, action) => {
    if (action === 'decline' && !window.confirm(`Từ chối lời mời tham gia "${inv.project.name}"?`)) return;
    setBusy(inv.id);
    setError('');
    try {
      const res = await api.post(`/invitations/${inv.token}/${action}`);
      setInvites((list) => list.filter((i) => i.id !== inv.id));
      if (action === 'accept') {
        onJoined?.();
        navigate(`/projects/${res.data.projectId}`);
      }
    } catch (err) {
      setError(errMsg(err));
      load();
    } finally {
      setBusy(null);
    }
  };

  if (!invites.length) return null;
  return (
    <div className="card invite-card">
      <h3>Lời mời tham gia dự án ({invites.length})</h3>
      {error && <div className="alert">{error}</div>}
      {invites.map((inv) => (
        <div key={inv.id} className="invite-row">
          <div className="grow">
            <strong>{inv.project.name}</strong>
            <div className="muted small">
              {inv.inviterName} mời bạn tham gia với vai trò {inv.role === 'leader' ? 'Trưởng nhóm' : 'Thành viên'}
              {' · '}{new Date(inv.createdAt).toLocaleString('vi-VN')}
            </div>
            {inv.project.description && <div className="muted small">{inv.project.description}</div>}
          </div>
          <div className="row">
            <button type="button" className="btn" disabled={busy === inv.id} onClick={() => answer(inv, 'decline')}>Từ chối</button>
            <button type="button" className="btn primary" disabled={busy === inv.id} onClick={() => answer(inv, 'accept')}>Tham gia</button>
          </div>
        </div>
      ))}
    </div>
  );
}
