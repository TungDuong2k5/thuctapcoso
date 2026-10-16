import { useState } from 'react';
import { isOverdue, todayISO } from './taskMeta';
import { assigneeNames } from './AssigneePicker';

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const MAX_PER_DAY = 3;

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Ngày (giờ Việt Nam) của một thời điểm, dạng YYYY-MM-DD
const vnDay = (when) => new Date(when).toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });

// Ngày hoàn thành thật: Done → ngày được duyệt; đã nộp chờ nhận xét → ngày nộp bài; chưa xong → null
function finishedDay(t) {
  if (t.status === 'done' && t.completedAt) return vnDay(t.completedAt);
  if (t.status === 'review' && t.submittedAt) return vnDay(t.submittedAt);
  return null;
}

// Khoảng ngày hiện trên lịch: từ ngày bắt đầu đến hạn; làm xong sớm thì dừng ở ngày hoàn thành
function dayRange(t) {
  const finished = finishedDay(t);
  let from = t.startDate || t.dueDate || finished;
  const to = finished || t.dueDate || t.startDate;
  if (from && to && from > to) from = to; // xong trước cả ngày bắt đầu
  return { from, to, finished };
}

function coversDay(t, day) {
  const { from, to } = dayRange(t);
  return from && from <= day && day <= to;
}

function dayMark(t, day) {
  const { finished } = dayRange(t);
  if (finished === day) return t.status === 'done' ? '✅ ' : '📤 ';
  if (!finished && t.dueDate === day) return `⏰ ${t.dueTime ? `${t.dueTime} ` : ''}`;
  return '';
}

// Chế độ Lịch: xem công việc theo tháng
export default function CalendarView({ tasks, onOpen }) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [expanded, setExpanded] = useState(null);

  // Lưới bắt đầu từ thứ Hai của tuần chứa ngày 1
  const start = new Date(month);
  start.setDate(1 - ((month.getDay() + 6) % 7));
  const days = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  // Bỏ hàng cuối nếu toàn ngày của tháng sau
  const cells = days[35].getMonth() !== month.getMonth() ? days.slice(0, 35) : days;

  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const today = todayISO();
  const undated = tasks.filter((t) => !dayRange(t).from);

  return (
    <div className="card calendar">
      <div className="row between">
        <div className="row">
          <button type="button" className="btn" onClick={() => shift(-1)}>‹</button>
          <h3 style={{ margin: 0, minWidth: 150, textAlign: 'center' }}>Tháng {month.getMonth() + 1}/{month.getFullYear()}</h3>
          <button type="button" className="btn" onClick={() => shift(1)}>›</button>
          <button type="button" className="btn ghost" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Hôm nay</button>
        </div>
        <div className="row small muted">
          <span className="cal-legend status-todo" /> To do
          <span className="cal-legend status-in_progress" /> In progress
          <span className="cal-legend status-review" /> Review
          <span className="cal-legend status-done" /> Done
          <span className="cal-legend overdue-bg" /> Quá hạn
        </div>
      </div>

      <div className="cal-grid">
        {WEEKDAYS.map((w) => <div key={w} className="cal-head">{w}</div>)}
        {cells.map((d) => {
          const day = iso(d);
          const items = tasks.filter((t) => coversDay(t, day));
          const showAll = expanded === day;
          const visible = showAll ? items : items.slice(0, MAX_PER_DAY);
          return (
            <div key={day} className={`cal-cell ${d.getMonth() !== month.getMonth() ? 'other' : ''} ${day === today ? 'today' : ''}`}>
              <div className="cal-date">{d.getDate()}</div>
              {visible.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className={`cal-task status-${t.status} ${isOverdue(t) ? 'overdue-bg' : ''}`}
                  title={`${t.title} · Người làm: ${assigneeNames(t, 10)}${t.startDate ? ` · bắt đầu ${t.startDate}` : ''}${t.dueDate ? ` · hạn ${t.dueTime || '23:59'} ${t.dueDate}` : ''}${finishedDay(t) ? ` · ${t.status === 'done' ? 'hoàn thành' : 'đã nộp'} ngày ${finishedDay(t)}` : ''}`}
                  onClick={() => onOpen(t.id)}
                >
                  <span className="cal-title">{dayMark(t, day)}{t.title}</span>
                  <span className="cal-who">👤 {assigneeNames(t, 2)}</span>
                </button>
              ))}
              {items.length > MAX_PER_DAY && (
                <button type="button" className="link small" onClick={() => setExpanded(showAll ? null : day)}>
                  {showAll ? 'Thu gọn' : `+${items.length - MAX_PER_DAY} việc nữa`}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="muted small">
        Công việc hiện từ ngày bắt đầu đến hạn (⏰ = ngày hết hạn). Làm xong sớm thì dừng ở ngày hoàn thành (✅ = được duyệt Done, 📤 = đã nộp, chờ nhận xét).
        {undated.length > 0 && ` Có ${undated.length} công việc chưa đặt ngày nên không hiện trên lịch.`}
      </p>
    </div>
  );
}
