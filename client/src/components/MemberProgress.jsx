import { useState } from 'react';
import Avatar from './Avatar';
import { paceTone } from './taskMeta';

// Nhãn nhỏ: Đúng tiến độ (xanh) / Chậm tiến độ (vàng)
export function PaceBadge({ stats }) {
  const tone = paceTone(stats);
  if (tone === 'none') return null;
  return tone === 'late'
    ? <span className="pace-badge late" title="Có việc quá hạn hoặc nộp muộn">⚠ Chậm tiến độ</span>
    : <span className="pace-badge ontime" title="Không có việc quá hạn hay nộp muộn">✓ Đúng tiến độ</span>;
}

const ROLE = { leader: 'Trưởng nhóm', member: 'Thành viên' };

// Thanh tiến độ: dài đúng bằng % hoàn thành (0–100%), màu đổi theo mức
export function ProgressBar({ stats }) {
  const p = stats.percent || 0;
  return (
    <div className="mp-bar" title={`Hoàn thành ${p}%`}>
      <div className={`fill tone-${paceTone(stats)}`} style={{ width: `${p}%` }} />
    </div>
  );
}

export function PersonRow({ person, stats, role, me }) {
  return (
    <div className="mp-row">
      <div className="mp-who">
        <Avatar name={person.fullName} src={person.avatarUrl} size={32} />
        <div>
          <strong>{person.fullName}{me && <small className="muted"> (bạn)</small>}</strong>
          {role && <small className={`tag ${role}`}>{ROLE[role] || role}</small>}
          <PaceBadge stats={stats} />
        </div>
      </div>
      <div className="mp-main">
        <ProgressBar stats={stats} />
        <small className="muted">
          {stats.total === 0 ? 'Chưa được giao việc' : (
            <>
              Xong <strong className="ok-text">{stats.done}</strong>/{stats.total} · Đang làm {stats.doing} · Chưa làm {stats.todo}
              {stats.overdue > 0 && <> · <span className="overdue">Quá hạn {stats.overdue}</span></>}
              {stats.late > 0 && <> · <span className="overdue">Nộp muộn {stats.late}</span></>}
            </>
          )}
        </small>
      </div>
      <strong className={`mp-percent tone-text-${paceTone(stats)}`}>{stats.percent}%</strong>
    </div>
  );
}

// Tiến độ hoàn thành của từng người trong dự án (trưởng nhóm thấy cả nhóm, thành viên thấy của mình)
export default function MemberProgress({ project, me, isLeader }) {
  const [open, setOpen] = useState(true);
  const people = project.members
    .filter((m) => m.stats && m.role !== 'guest')
    .sort((a, b) => (a.role === b.role ? b.stats.percent - a.stats.percent : a.role === 'leader' ? -1 : 1));
  if (!people.length) return null;

  return (
    <div className="card member-progress">
      <button type="button" className="mp-head" onClick={() => setOpen(!open)}>
        <strong>📊 {isLeader ? 'Tiến độ hoàn thành của từng người' : 'Tiến độ của bạn'}</strong>
        <span className="muted small">{open ? 'Thu gọn ▲' : 'Mở ▼'}</span>
      </button>
      {open && (
        <div className="mp-list">
          {people.map((m) => <PersonRow key={m.id} person={m} stats={m.stats} role={m.role} me={m.id === me.id} />)}
          <div className="mp-legend small muted">
            Xanh = đúng tiến độ · Vàng = chậm tiến độ (có việc quá hạn hoặc nộp muộn).
            % hoàn thành: To do 0% · In progress theo mức người làm cập nhật (10–90%) · Đã nộp chờ duyệt 90% · Done 100%.
          </div>
        </div>
      )}
    </div>
  );
}
