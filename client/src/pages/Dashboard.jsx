import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg, getSocket } from '../api/client';
import { useAuth } from '../context/AuthContext';
import PendingInvitations from '../components/PendingInvitations';
import {
  COLUMNS, deadlineOf, formatDeadline, todayISO,
} from '../components/taskMeta';

const DAY = 864e5;
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shiftIso = (iso, n) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return isoOf(d); };
const longDate = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  const wd = d.toLocaleDateString('vi-VN', { weekday: 'long' });
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const statusLabel = (s) => COLUMNS.find((c) => c.key === s)?.label;
const taskLink = (t) => `/projects/${t.projectId}?task=${t.id}`;

// Trang chủ: số liệu nhanh + Việc cần xử lý · Lịch công việc theo ngày · Hạn nộp sắp tới
export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [day, setDay] = useState(todayISO());

  const load = useCallback(() => {
    setError('');
    api.get('/dashboard').then((res) => setData(res.data)).catch((err) => setError(errMsg(err)));
  }, []);

  useEffect(() => {
    load();
    const socket = getSocket();
    socket.on('notification:new', load); // được giao việc, có bài cần nhận xét… → làm mới
    return () => socket.off('notification:new', load);
  }, [load]);

  const now = new Date();
  const tasks = data?.myTasks || [];
  const working = tasks.filter((t) => t.status !== 'review');
  const overdue = working.filter((t) => t.dueDate && deadlineOf(t) < now);
  const soon = working.filter((t) => t.dueDate && deadlineOf(t) >= now && deadlineOf(t) - now <= 3 * DAY);
  const upcoming = working
    .filter((t) => t.dueDate && deadlineOf(t) >= now && deadlineOf(t) - now <= 7 * DAY)
    .sort((a, b) => deadlineOf(a) - deadlineOf(b));
  const todo = [...working].sort((a, b) => (a.dueDate ? deadlineOf(a) : Infinity) - (b.dueDate ? deadlineOf(b) : Infinity));
  const onDay = tasks.filter((t) => {
    const from = t.startDate || t.dueDate;
    const to = t.dueDate || t.startDate;
    return from && from <= day && day <= to;
  });

  const stats = [
    { label: 'Dự án đang tham gia', value: data?.activeProjects ?? '–', to: '/projects?nhom=mine' },
    { label: 'Việc cần làm', value: data ? working.length : '–' },
    { label: 'Sắp đến hạn (3 ngày)', value: data ? soon.length : '–', tone: soon.length ? 'warn' : '' },
    { label: 'Quá hạn', value: data ? overdue.length : '–', tone: overdue.length ? 'danger' : '' },
  ];

  return (
    <div className="dashboard">
      <PendingInvitations onJoined={load} />
      <div className="dash-head">
        <div>
          <h2>Xin chào, {user.fullName} 👋</h2>
          <small className="muted">{longDate(todayISO())}</small>
        </div>
      </div>
      {error && <div className="alert">{error}</div>}

      <div className="dash-stats">
        {stats.map((s) => {
          const body = (
            <>
              <small>{s.label}</small>
              <strong className={s.tone ? `tone-${s.tone}` : ''}>{s.value}</strong>
            </>
          );
          return s.to
            ? <Link key={s.label} to={s.to} className="dash-stat">{body}</Link>
            : <div key={s.label} className="dash-stat">{body}</div>;
        })}
      </div>

      <div className="dash-panels">
        <section className="dash-panel">
          <div className="dash-panel-head">
            <span className="dash-title">☰ Việc cần xử lý</span>
            <button type="button" className="icon-btn" onClick={load} title="Làm mới">⟳</button>
          </div>
          <div className="dash-panel-body">
            {!data && !error && <Empty icon="…" text="Đang tải..." />}
            {data && !data.reviews.length && !todo.length && <Empty icon="✓" text="Không có việc nào đang chờ." />}
            {data?.reviews.map((t) => (
              <Link key={`r${t.id}`} to={taskLink(t)} className="dash-item">
                <span className="dash-item-title">{t.title}</span>
                <small className="muted">{t.projectName} · {t.assigneeNames}</small>
                <span className="dash-chip review">Chờ bạn nhận xét</span>
              </Link>
            ))}
            {todo.map((t) => {
              const late = t.dueDate && deadlineOf(t) < now;
              return (
                <Link key={t.id} to={taskLink(t)} className="dash-item">
                  <span className="dash-item-title">{t.priority === 'urgent' && '🚨 '}{t.title}</span>
                  <small className="muted">{t.projectName} · {statusLabel(t.status)}</small>
                  {t.dueDate && <span className={`dash-chip ${late ? 'late' : ''}`}>{late ? 'Quá hạn ' : 'Hạn '}{formatDeadline(t, true)}</span>}
                </Link>
              );
            })}
          </div>
        </section>

        <section className="dash-panel">
          <div className="dash-panel-head">
            <span className="dash-title">📅 Lịch công việc</span>
            <button type="button" className="icon-btn" onClick={() => setDay(todayISO())} title="Về hôm nay">⟳</button>
          </div>
          <div className="dash-daynav">
            <button type="button" className="icon-btn" onClick={() => setDay(shiftIso(day, -1))} aria-label="Ngày trước">‹</button>
            <strong>{longDate(day)}</strong>
            <button type="button" className="icon-btn" onClick={() => setDay(shiftIso(day, 1))} aria-label="Ngày sau">›</button>
          </div>
          <div className="dash-panel-body">
            {data && !onDay.length && <Empty icon="🗓" text="Không có công việc trong ngày này." />}
            {onDay.map((t) => (
              <Link key={t.id} to={taskLink(t)} className="dash-item">
                <span className="dash-item-title">{t.dueDate === day ? '⏰ ' : ''}{t.title}</span>
                <small className="muted">{t.projectName} · {statusLabel(t.status)}</small>
                {t.dueDate === day && <span className="dash-chip">Hết hạn {t.dueTime || '23:59'}</span>}
              </Link>
            ))}
          </div>
        </section>

        <section className="dash-panel">
          <div className="dash-panel-head">
            <span className="dash-title">⏰ Hạn nộp sắp tới</span>
            <button type="button" className="icon-btn" onClick={load} title="Làm mới">⟳</button>
          </div>
          <div className="dash-panel-body">
            {data && !upcoming.length && <Empty icon="📋" text="Không có hạn nộp trong 7 ngày tới." />}
            {upcoming.map((t) => {
              const left = deadlineOf(t) - now;
              const leftText = left < DAY ? `còn ${Math.max(1, Math.round(left / 36e5))} giờ` : `còn ${Math.ceil(left / DAY)} ngày`;
              return (
                <Link key={t.id} to={taskLink(t)} className="dash-item">
                  <span className="dash-item-title">{t.title}</span>
                  <small className="muted">{t.projectName}</small>
                  <span className={`dash-chip ${left < DAY ? 'late' : 'warn'}`}>{formatDeadline(t, true)} · {leftText}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function Empty({ icon, text }) {
  return (
    <div className="dash-empty">
      <span className="dash-empty-icon">{icon}</span>
      <span>{text}</span>
    </div>
  );
}
