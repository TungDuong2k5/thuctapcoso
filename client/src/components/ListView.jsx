import { useState } from 'react';
import {
  COLUMNS, isOverdue, viDate, formatDeadline, isUrgentTask, lateLabel, deadlineOf,
} from './taskMeta';
import { assigneeNames } from './AssigneePicker';
import { LabelChips } from './LabelPicker';

const STATUS_RANK = Object.fromEntries(COLUMNS.map((c, i) => [c.key, i]));

// Cách lấy giá trị để sắp xếp cho từng cột
const SORTERS = {
  title: (t) => t.title.toLowerCase(),
  status: (t) => STATUS_RANK[t.status],
  priority: (t) => (isUrgentTask(t) ? 0 : 1),
  assignees: (t) => assigneeNames(t, 9).toLowerCase(),
  startDate: (t) => t.startDate || '9999',
  dueDate: (t) => (t.dueDate ? deadlineOf(t).getTime() : Infinity),
  submit: (t) => (t.submittedAt ? t.submittedLateMinutes || 0 : -1),
};

const HEADERS = [
  ['title', 'Công việc'], ['status', 'Trạng thái'], ['priority', 'Khẩn cấp'], ['assignees', 'Người làm'],
  [null, 'Nhãn'], ['startDate', 'Bắt đầu'], ['dueDate', 'Hạn nộp'], ['submit', 'Nộp bài'],
];

// Chế độ Danh sách: bảng dữ liệu, bấm tiêu đề cột để sắp xếp
export default function ListView({ tasks, onOpen }) {
  const [sort, setSort] = useState({ key: 'dueDate', dir: 1 });

  const sorted = [...tasks].sort((a, b) => {
    const get = SORTERS[sort.key];
    const x = get(a);
    const y = get(b);
    if (x < y) return -sort.dir;
    if (x > y) return sort.dir;
    return a.id - b.id;
  });

  const clickHeader = (key) => key && setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }));

  return (
    <div className="card table-wrap">
      <table className="table list-view">
        <thead>
          <tr>
            {HEADERS.map(([key, label]) => (
              <th key={label} className={key ? 'sortable' : ''} onClick={() => clickHeader(key)}>
                {label}{sort.key === key && (sort.dir === 1 ? ' ▲' : ' ▼')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && <tr><td colSpan={HEADERS.length} className="muted center">Không có công việc nào</td></tr>}
          {sorted.map((t) => {
            const late = lateLabel(t);
            return (
              <tr key={t.id} className="clickable" onClick={() => onOpen(t.id)}>
                <td><strong>{t.title}</strong></td>
                <td><span className={`tag status-${t.status}`}>{COLUMNS.find((c) => c.key === t.status)?.label}</span></td>
                <td>{isUrgentTask(t) ? <span className="prio urgent">🚨 Khẩn cấp</span> : <span className="muted">—</span>}</td>
                <td>{assigneeNames(t, 3)}</td>
                <td><LabelChips labels={t.labels} /></td>
                <td>{viDate(t.startDate)}</td>
                <td className={isOverdue(t) ? 'overdue' : ''}>{formatDeadline(t)}</td>
                <td>
                  {!t.submittedAt && <span className="muted">Chưa nộp</span>}
                  {t.submittedAt && (late ? <span className="late-badge">{late}</span> : <span className="ok-text">Đúng hạn</span>)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small">{tasks.length} công việc · bấm tiêu đề cột để sắp xếp, bấm một dòng để mở chi tiết</p>
    </div>
  );
}
