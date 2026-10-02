import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api/client';

const empty = { name: '', description: '', startDate: '', endDate: '' };

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState(empty);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = () => api.get('/projects', { params: { archived: showArchived ? 1 : 0 } }).then((res) => setProjects(res.data));
  useEffect(() => { load(); }, [showArchived]);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post('/projects', form);
      setForm(empty);
      setCreating(false);
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  return (
    <div>
      <div className="page-head">
        <h2>Dự án của tôi</h2>
        <div className="row">
          <label className="check">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Hiện dự án đã lưu trữ
          </label>
          <button type="button" className="btn primary" onClick={() => setCreating(!creating)}>+ Dự án mới</button>
        </div>
      </div>

      {creating && (
        <form className="card form-grid" onSubmit={create}>
          {error && <div className="alert span2">{error}</div>}
          <label className="span2">Tên dự án<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="span2">Mô tả<textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label>Ngày bắt đầu<input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
          <label>Ngày kết thúc<input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
          <div className="span2 row end">
            <button type="button" className="btn ghost" onClick={() => setCreating(false)}>Hủy</button>
            <button type="submit" className="btn primary">Tạo dự án</button>
          </div>
        </form>
      )}

      {projects.length === 0 && <p className="muted">Bạn chưa tham gia dự án nào. Hãy tạo dự án mới hoặc nhờ trưởng nhóm thêm bạn vào.</p>}
      <div className="project-grid">
        {projects.map((p) => (
          <Link key={p.id} to={`/projects/${p.id}`} className="card project-card">
            <div className="row between">
              <h3>{p.name}</h3>
              <span className={`tag ${p.myRole}`}>{p.myRole === 'leader' ? 'Trưởng nhóm' : 'Thành viên'}</span>
            </div>
            <p className="muted">{p.description || 'Không có mô tả'}</p>
            <small className="muted">
              {p.startDate || '?'} → {p.endDate || '?'} · Tạo bởi {p.owner?.fullName}
              {p.status === 'archived' && ' · Đã lưu trữ'}
            </small>
          </Link>
        ))}
      </div>
    </div>
  );
}
