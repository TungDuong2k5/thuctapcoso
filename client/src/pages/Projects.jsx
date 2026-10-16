import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import PendingInvitations from '../components/PendingInvitations';

const empty = { name: '', description: '', startDate: '', endDate: '' };
const ROLE = { leader: 'Trưởng nhóm', member: 'Thành viên', guest: 'Khách' };
const viDate = (d) => (d ? d.split('-').reverse().join('/') : '?');

// Dự án đã hoàn thành: trưởng nhóm đánh dấu hoàn thành, hoặc mọi công việc đều đã Done
const isFinished = (p) => p.status === 'archived' || p.progress?.state === 'completed';

const GROUPS = {
  mine: {
    icon: '👑', title: 'Dự án của tôi', hint: 'Dự án bạn làm trưởng nhóm', empty: 'Bạn chưa làm trưởng nhóm dự án nào. Bấm “+ Dự án mới” để tạo.',
  },
  joined: {
    icon: '🤝', title: 'Dự án đã tham gia', hint: 'Dự án bạn là thành viên', empty: 'Bạn chưa tham gia dự án nào của người khác. Lời mời tham gia sẽ hiện ở trang Dự án.',
  },
};

export default function Projects() {
  const [projects, setProjects] = useState(null);
  const [form, setForm] = useState(empty);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  // ?nhom=mine | joined (chọn ở thanh bên trái); mặc định là Dự án của tôi
  const [params] = useSearchParams();
  const group = GROUPS[params.get('nhom')] ? params.get('nhom') : 'mine';

  // Lấy cả dự án đã hoàn thành (lưu trữ) để chia nhóm Đang làm / Đã hoàn thành
  const load = () => api.get('/projects', { params: { archived: 1 } }).then((res) => setProjects(res.data));
  useEffect(() => { load(); }, []);

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

  const lists = {
    mine: (projects || []).filter((p) => p.myRole === 'leader'),
    joined: (projects || []).filter((p) => p.myRole !== 'leader'),
  };

  return (
    <div>
      <PendingInvitations onJoined={load} />
      <div className="page-head">
        <div>
          <h2>{GROUPS[group].icon} {GROUPS[group].title} {projects && <span className="count-pill">{lists[group].length}</span>}</h2>
          <small className="muted">{GROUPS[group].hint}</small>
        </div>
        <button type="button" className="btn primary" onClick={() => setCreating(!creating)}>+ Dự án mới</button>
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

      {projects === null && <p className="muted">Đang tải...</p>}
      {projects && <ProjectSection key={group} {...GROUPS[group]} items={lists[group]} />}
    </div>
  );
}

// Một phần (Dự án của tôi / Dự án đã tham gia), chia 2 nhóm Đang làm và Đã hoàn thành
function ProjectSection({ items, empty }) {
  const [tab, setTab] = useState('doing');
  const doing = items.filter((p) => !isFinished(p));
  const done = items.filter(isFinished);
  const shown = tab === 'doing' ? doing : done;

  return (
    <section className="project-section">
      <div className="row project-section-head">
        <div className="view-switch" role="tablist">
          <button type="button" className={tab === 'doing' ? 'active' : ''} onClick={() => setTab('doing')}>🚧 Đang làm ({doing.length})</button>
          <button type="button" className={tab === 'done' ? 'active' : ''} onClick={() => setTab('done')}>✅ Đã hoàn thành ({done.length})</button>
        </div>
      </div>

      {items.length === 0 && <p className="muted small">{empty}</p>}
      {items.length > 0 && shown.length === 0 && (
        <p className="muted small">{tab === 'doing' ? 'Không có dự án nào đang làm.' : 'Chưa có dự án nào hoàn thành.'}</p>
      )}
      <div className="project-grid">
        {shown.map((p) => (
          <Link key={p.id} to={`/projects/${p.id}`} className={`card project-card ${isFinished(p) ? (p.finish?.late ? 'finished late' : 'finished ontime') : ''}`}>
            <div className="row between">
              <h3>{p.name}</h3>
              <span className={`tag ${p.myRole}`}>{ROLE[p.myRole]}</span>
            </div>
            <p className="muted">{p.description || 'Không có mô tả'}</p>
            {isFinished(p) && (p.finish?.late
              ? <span className="finished-badge late" title={`Kết thúc dự án: ${viDate(p.endDate)} · Hoàn thành: ${viDate(p.finish.finishedOn)}`}>⚠ Hoàn thành chậm tiến độ ({p.finish.lateDays} ngày)</span>
              : <span className="finished-badge" title={p.finish?.finishedOn ? `Hoàn thành ngày ${viDate(p.finish.finishedOn)}` : ''}>✅ Hoàn thành đúng tiến độ</span>)}
            <small className="muted">
              {viDate(p.startDate)} → {viDate(p.endDate)} · Tạo bởi {p.owner?.fullName}
            </small>
          </Link>
        ))}
      </div>
    </section>
  );
}
