import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';

const PALETTE = ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#9333ea', '#db2777', '#64748b'];

// Cài đặt dự án (trưởng nhóm): thông tin dự án, bộ nhãn, xóa dự án
export default function ProjectSettings({ project, onChange }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState({
    name: project.name,
    description: project.description || '',
    startDate: project.startDate || '',
    endDate: project.endDate || '',
    status: project.status,
  });
  const [newLabel, setNewLabel] = useState({ name: '', color: PALETTE[5] });
  const [editing, setEditing] = useState({});
  const [confirmName, setConfirmName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const call = async (fn, okText) => {
    setError('');
    setMessage('');
    try {
      await fn();
      if (okText) setMessage(okText);
      onChange();
      return true;
    } catch (err) {
      setError(errMsg(err));
      return false;
    }
  };

  const saveInfo = (e) => {
    e.preventDefault();
    call(() => api.put(`/projects/${project.id}`, { ...info, startDate: info.startDate || null, endDate: info.endDate || null }), 'Đã lưu thông tin dự án');
  };

  const addLabel = async (e) => {
    e.preventDefault();
    if (await call(() => api.post(`/projects/${project.id}/labels`, newLabel), 'Đã thêm nhãn')) {
      setNewLabel({ name: '', color: newLabel.color });
    }
  };

  const saveLabel = async (l) => {
    const data = editing[l.id];
    if (await call(() => api.put(`/labels/${l.id}`, data), 'Đã lưu nhãn')) {
      setEditing(({ [l.id]: _, ...rest }) => rest);
    }
  };

  const removeLabel = (l) => {
    if (!window.confirm(`Xóa nhãn "${l.name}"? Nhãn sẽ được gỡ khỏi mọi công việc.`)) return;
    call(() => api.delete(`/labels/${l.id}`), 'Đã xóa nhãn');
  };

  const removeProject = async () => {
    setError('');
    try {
      await api.delete(`/projects/${project.id}`, { data: { confirmName } });
      navigate('/', { replace: true });
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const canDelete = project.ownerId === user.id || user.systemRole === 'admin';

  return (
    <div className="settings">
      {error && <div className="alert">{error}</div>}
      {message && <div className="info">{message}</div>}

      <form className="card" onSubmit={saveInfo}>
        <h3>Thông tin dự án</h3>
        <div className="form-grid">
          <label className="span2">Tên dự án<input required maxLength={150} value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} /></label>
          <label className="span2">Mô tả<textarea rows={2} value={info.description} onChange={(e) => setInfo({ ...info, description: e.target.value })} /></label>
          <label>Ngày bắt đầu<input type="date" value={info.startDate} onChange={(e) => setInfo({ ...info, startDate: e.target.value })} /></label>
          <label>Ngày kết thúc<input type="date" min={info.startDate || undefined} value={info.endDate} onChange={(e) => setInfo({ ...info, endDate: e.target.value })} /></label>
          <label>Trạng thái
            <select value={info.status} onChange={(e) => setInfo({ ...info, status: e.target.value })}>
              <option value="active">🚧 Đang làm</option>
              <option value="archived">✅ Đã hoàn thành (dừng nhắc hạn)</option>
            </select>
          </label>
        </div>
        <div className="row end"><button type="submit" className="btn primary">Lưu thông tin</button></div>
      </form>

      <div className="card">
        <h3>Nhãn (tag) của dự án</h3>
        <p className="muted small">Dùng để phân loại công việc (VD Bug, Tính năng, Tài liệu…) và lọc trên bảng công việc.</p>
        <ul className="label-admin">
          {(project.labels || []).map((l) => {
            const e = editing[l.id];
            return (
              <li key={l.id}>
                {e ? (
                  <>
                    <input type="color" value={e.color} onChange={(ev) => setEditing({ ...editing, [l.id]: { ...e, color: ev.target.value } })} />
                    <input className="grow" maxLength={30} value={e.name} onChange={(ev) => setEditing({ ...editing, [l.id]: { ...e, name: ev.target.value } })} />
                    <button type="button" className="btn primary" onClick={() => saveLabel(l)}>Lưu</button>
                    <button type="button" className="btn ghost" onClick={() => setEditing(({ [l.id]: _, ...rest }) => rest)}>Hủy</button>
                  </>
                ) : (
                  <>
                    <span className="label-chip" style={{ background: l.color }}>{l.name}</span>
                    <span className="grow" />
                    <button type="button" className="link" onClick={() => setEditing({ ...editing, [l.id]: { name: l.name, color: l.color } })}>Sửa</button>
                    <button type="button" className="link danger-text" onClick={() => removeLabel(l)}>Xóa</button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        <form className="row" onSubmit={addLabel}>
          <div className="palette">
            {PALETTE.map((c) => (
              <button
                type="button"
                key={c}
                className={newLabel.color === c ? 'active' : ''}
                style={{ background: c }}
                title={c}
                onClick={() => setNewLabel({ ...newLabel, color: c })}
              />
            ))}
          </div>
          <input className="grow" required maxLength={30} placeholder="Tên nhãn mới, VD: Giao diện" value={newLabel.name} onChange={(e) => setNewLabel({ ...newLabel, name: e.target.value })} />
          <button type="submit" className="btn">Thêm nhãn</button>
        </form>
      </div>

      {canDelete && (
        <div className="card danger-zone">
          <h3>Xóa dự án</h3>
          <p className="small">
            Xóa vĩnh viễn dự án cùng <strong>toàn bộ</strong> công việc, file đã nộp, bình luận, báo cáo tuần.
            Không thể khôi phục. Các thành viên sẽ nhận được thông báo.
          </p>
          <label>Gõ đúng tên dự án <strong>{project.name}</strong> để xác nhận
            <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={project.name} />
          </label>
          <div className="row end">
            <button type="button" className="btn danger" disabled={confirmName.trim() !== project.name} onClick={removeProject}>
              Xóa vĩnh viễn dự án
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
