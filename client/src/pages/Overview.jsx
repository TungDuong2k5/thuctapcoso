import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import Avatar from '../components/Avatar';
import { ProgressBar, PaceBadge } from '../components/MemberProgress';
import { paceTone } from '../components/taskMeta';

const ROLE = { leader: 'Trưởng nhóm', member: 'Thành viên', guest: 'Khách' };
const ddmm = (iso) => iso.slice(5).split('-').reverse().join('/');
const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

// Lấy dữ liệu tổng quan (dùng chung cho trang Tổng quan và khung Báo cáo tiến độ)
export function useOverview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    api.get('/overview').then((res) => setData(res.data)).catch((err) => setError(errMsg(err)));
  }, []);
  useEffect(() => { load(); }, [load]);
  return { data, error, reload: load };
}

// Tổng quan: tiến độ của mọi người + tiến độ hàng ngày, hàng tuần (trên tất cả dự án)
export default function Overview() {
  const { data, error, reload } = useOverview();
  if (error) return <div className="alert">{error}</div>;
  if (!data) return <p className="muted">Đang tải...</p>;

  const sum = data.people.reduce((s, p) => ({
    total: s.total + p.total, points: s.points + (p.points || 0), today: s.today + p.doneToday, week: s.week + p.doneThisWeek, overdue: s.overdue + p.overdue,
  }), {
    total: 0, points: 0, today: 0, week: 0, overdue: 0,
  });
  const percent = sum.total ? Math.round(sum.points / sum.total) : 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Tổng quan tiến độ</h2>
          <small className="muted">
            {data.leaderOf > 0
              ? `Tiến độ của mọi người trong ${data.projects.length} dự án (bạn là trưởng nhóm ở ${data.leaderOf} dự án).`
              : 'Tiến độ của bạn trong tất cả dự án. Chỉ trưởng nhóm theo dõi được tiến độ của các thành viên khác.'}
          </small>
        </div>
        <button type="button" className="btn" onClick={reload}>Làm mới</button>
      </div>

      {data.projects.length === 0 ? <p className="muted">Bạn chưa tham gia dự án nào.</p> : (
        <>
          <div className="stat-row">
            <div className="card stat"><span className="muted">Mức hoàn thành chung</span><strong className={`tone-text-${paceTone({ total: sum.total, overdue: sum.overdue })}`}>{percent}%</strong></div>
            <div className="card stat"><span className="muted">Xong hôm nay</span><strong className="ok-text">{sum.today}</strong></div>
            <div className="card stat"><span className="muted">Xong tuần này</span><strong className="ok-text">{sum.week}</strong></div>
            <div className="card stat"><span className="muted">Đang quá hạn</span><strong className={sum.overdue ? 'overdue' : ''}>{sum.overdue}</strong></div>
          </div>

          <OverviewPeople people={data.people} />

          <div className="two-col">
            <div className="card">
              <h3>Tiến độ hàng ngày <small className="muted">(14 ngày gần nhất)</small></h3>
              <BarChart
                items={data.daily.map((d) => ({
                  key: d.date, label: `${WEEKDAY[new Date(`${d.date}T00:00:00`).getDay()]} ${ddmm(d.date)}`, done: d.done, submitted: d.submitted,
                }))}
              />
            </div>
            <div className="card">
              <h3>Tiến độ hàng tuần <small className="muted">(8 tuần gần nhất)</small></h3>
              <BarChart items={data.weekly.map((w) => ({ key: w.weekStart, label: `Tuần ${ddmm(w.weekStart)}`, done: w.done, submitted: w.submitted }))} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Tiến độ theo tuần (8 tuần) và theo tháng (6 tháng)
export function TimelineCharts({ data }) {
  return (
    <div className="two-col">
      <div className="card">
        <h3>Tiến độ theo tuần <small className="muted">(8 tuần gần nhất)</small></h3>
        <BarChart items={data.weekly.map((w) => ({ key: w.weekStart, label: `Tuần ${ddmm(w.weekStart)}`, done: w.done, submitted: w.submitted }))} />
      </div>
      <div className="card">
        <h3>Tiến độ theo tháng <small className="muted">(6 tháng gần nhất)</small></h3>
        <BarChart items={(data.monthly || []).map((m) => ({ key: m.month, label: `Th ${Number(m.month.slice(5))}/${m.month.slice(2, 4)}`, done: m.done, submitted: m.submitted }))} />
      </div>
    </div>
  );
}

// Hiệu suất của mọi người trong từng dự án
export function ProjectsPerformance({ data }) {
  return (
    <div className="pp-grid">
      {data.projects.map((pr) => {
        const rows = data.people
          .map((p) => ({ person: p, stats: p.projects.find((x) => x.projectId === pr.id) }))
          .filter((r) => r.stats)
          .sort((a, b) => b.stats.percent - a.stats.percent);
        return (
          <div key={pr.id} className="card pp-card">
            <div className="row between">
              <Link to={`/projects/${pr.id}`}><h3 style={{ margin: 0 }}>{pr.name}</h3></Link>
              <span className={`tag ${pr.myRole}`}>{ROLE[pr.myRole]}</span>
            </div>
            <div className="pp-total">
              <ProgressBar stats={pr.progress} />
              <strong className={`tone-text-${paceTone(pr.progress)}`}>{pr.progress.percent}%</strong>
            </div>
            <small className="muted">Cả dự án: xong {pr.progress.done}/{pr.progress.total} việc{pr.progress.overdue > 0 && ` · ${pr.progress.overdue} quá hạn`}</small>
            <div className="pp-people">
              {rows.length === 0 && <small className="muted">Chưa có ai được giao việc</small>}
              {rows.map(({ person, stats }) => (
                <div key={person.userId} className="pv-person">
                  <span className="pv-name" title={person.fullName}>
                    <Avatar name={person.fullName} src={person.avatarUrl} size={20} /> {person.isMe ? 'Bạn' : person.fullName}
                  </span>
                  <ProgressBar stats={stats} />
                  <small className={`tone-text-${paceTone(stats)}`}>{stats.percent}%</small>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Biểu đồ cột: số việc hoàn thành (xanh) và số bài nộp (xanh dương) theo ngày / tuần / tháng
function BarChart({ items }) {
  const max = Math.max(1, ...items.map((i) => Math.max(i.done, i.submitted)));
  return (
    <>
      <div className="bar-chart">
        {items.map((i) => (
          <div key={i.key} className="bc-col" title={`${i.label}: hoàn thành ${i.done}, nộp bài ${i.submitted}`}>
            <div className="bc-bars">
              <div className="bc-bar done" style={{ height: `${(i.done / max) * 100}%` }}>{i.done > 0 && <span>{i.done}</span>}</div>
              <div className="bc-bar submitted" style={{ height: `${(i.submitted / max) * 100}%` }}>{i.submitted > 0 && <span>{i.submitted}</span>}</div>
            </div>
            <small>{i.label}</small>
          </div>
        ))}
      </div>
      <div className="mp-legend small muted">
        <span><i className="dot done" /> Việc hoàn thành (được duyệt Đạt)</span>
        <span><i className="dot submitted" /> Bài nộp</span>
      </div>
    </>
  );
}

// Bảng tiến độ từng người qua tất cả dự án (bấm vào để xem từng dự án)
export function OverviewPeople({ people }) {
  const [expanded, setExpanded] = useState(null);
  return (
    <div className="card table-wrap">
      <h3>Tiến độ của mọi người (tất cả dự án)</h3>
      <p className="muted small">Bấm vào một người để xem tiến độ của họ trong từng dự án.</p>
      <table className="table overview-table">
        <thead>
          <tr>
            <th>Người</th><th>Dự án</th><th>Được giao</th><th>Đã xong</th><th>Xong hôm nay</th><th>Xong tuần này</th>
            <th>Quá hạn</th><th>Nộp muộn</th><th style={{ minWidth: 200 }}>Mức hoàn thành</th>
          </tr>
        </thead>
        <tbody>
          {people.length === 0 && <tr><td colSpan={9} className="muted center">Chưa có dữ liệu</td></tr>}
          {people.map((p) => (
            <PersonRows key={p.userId} person={p} open={expanded === p.userId} onToggle={() => setExpanded(expanded === p.userId ? null : p.userId)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PersonRows({ person: p, open, onToggle }) {
  return (
    <>
      <tr className="clickable" onClick={onToggle}>
        <td>
          <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
            <Avatar name={p.fullName} src={p.avatarUrl} size={28} />
            <span>{p.fullName}{p.isMe && <small className="muted"> (bạn)</small>}</span>
            <PaceBadge stats={p} />
            <small className="muted">{open ? '▲' : '▼'}</small>
          </span>
        </td>
        <td>{p.projects.length}</td>
        <td>{p.total}</td>
        <td className="ok-text">{p.done}</td>
        <td>{p.doneToday}</td>
        <td>{p.doneThisWeek}</td>
        <td className={p.overdue ? 'overdue' : ''}>{p.overdue}</td>
        <td className={p.late ? 'overdue' : ''}>{p.late}</td>
        <td><span className="row" style={{ flexWrap: 'nowrap' }}><ProgressBar stats={p} /><strong className={`tone-text-${paceTone(p)}`}>{p.percent}%</strong></span></td>
      </tr>
      {open && p.projects.map((pr) => (
        <tr key={pr.projectId} className="sub-row">
          <td colSpan={2}>
            ↳ <Link to={`/projects/${pr.projectId}`}>{pr.name}</Link> <small className={`tag ${pr.role}`}>{ROLE[pr.role]}</small>
          </td>
          <td>{pr.total}</td>
          <td className="ok-text">{pr.done}</td>
          <td>{pr.doneToday}</td>
          <td>{pr.doneThisWeek}</td>
          <td className={pr.overdue ? 'overdue' : ''}>{pr.overdue}</td>
          <td className={pr.late ? 'overdue' : ''}>{pr.late}</td>
          <td><span className="row" style={{ flexWrap: 'nowrap' }}><ProgressBar stats={pr} /><span>{pr.percent}%</span></span></td>
        </tr>
      ))}
    </>
  );
}
