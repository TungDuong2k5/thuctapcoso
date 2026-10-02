import { useEffect, useState } from 'react';
import api from '../api/client';
import { COLUMNS } from './Board';

export default function StatsTab({ project }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get(`/projects/${project.id}/stats`).then((res) => setStats(res.data));
  }, [project.id]);

  if (!stats) return <p className="muted">Đang tải...</p>;
  const maxWeekly = Math.max(1, ...stats.weekly.map((w) => w.done));

  return (
    <div>
      <div className="stat-row">
        <div className="card stat"><span className="muted">Tổng công việc</span><strong>{stats.total}</strong></div>
        <div className="card stat"><span className="muted">Hoàn thành</span><strong>{stats.completion}%</strong></div>
        <div className="card stat"><span className="muted">Đã xong</span><strong>{stats.done}</strong></div>
        <div className="card stat"><span className="muted">Quá hạn</span><strong className={stats.overdue ? 'overdue' : ''}>{stats.overdue}</strong></div>
      </div>

      <div className="two-col">
        <div className="card">
          <h3>Theo trạng thái</h3>
          {COLUMNS.map((c) => (
            <div key={c.key} className="bar-row">
              <span>{c.label}</span>
              <div className="bar"><div style={{ width: `${stats.total ? (stats.byStatus[c.key] / stats.total) * 100 : 0}%` }} /></div>
              <span>{stats.byStatus[c.key]}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <h3>Hoàn thành theo tuần</h3>
          <div className="week-chart">
            {stats.weekly.map((w) => (
              <div key={w.weekStart} className="week-col">
                <span>{w.done}</span>
                <div className="week-bar" style={{ height: `${(w.done / maxWeekly) * 100}%` }} />
                <small className="muted">{w.weekStart.slice(5)}</small>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Khối lượng theo thành viên</h3>
        <table className="table">
          <thead><tr><th>Thành viên</th><th>Được giao</th><th>Đã xong</th><th>Quá hạn</th><th>Tiến độ</th></tr></thead>
          <tbody>
            {stats.byMember.map((m) => (
              <tr key={m.userId}>
                <td>{m.fullName}</td>
                <td>{m.total}</td>
                <td>{m.done}</td>
                <td className={m.overdue ? 'overdue' : ''}>{m.overdue}</td>
                <td><div className="bar"><div style={{ width: `${m.total ? (m.done / m.total) * 100 : 0}%` }} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
