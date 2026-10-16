// Tính tiến độ hoàn thành của một người (trên danh sách công việc được giao cho họ)
const { deadlineOf } = require('../utils/deadline');

// % hoàn thành của 1 công việc:
//   To do 0% · In progress = mức người làm tự cập nhật (10–90%) · Review (đã nộp, chờ duyệt) 90% · Done 100%
function taskPercent(t) {
  if (t.status === 'done') return 100;
  if (t.status === 'review') return 90;
  if (t.status === 'in_progress') return Math.min(90, Math.max(10, t.progress || 0));
  return 0;
}

function personStats(tasks, now = new Date()) {
  const s = {
    total: tasks.length, done: 0, doing: 0, todo: 0, overdue: 0, onTime: 0, late: 0, points: 0,
  };
  for (const t of tasks) {
    s.points += taskPercent(t);
    if (t.status === 'done') s.done += 1;
    else if (t.status === 'todo') s.todo += 1;
    else s.doing += 1; // in_progress + review
    if (!['done', 'review'].includes(t.status) && t.dueDate && deadlineOf(t) < now) s.overdue += 1;
    if (t.submittedLateMinutes > 0) s.late += 1;
    else if (t.status === 'done' && t.dueDate) s.onTime += 1;
  }
  // % của người = trung bình % các công việc được giao
  s.percent = s.total ? Math.round(s.points / s.total) : 0;
  return s;
}

function addStats(a, b) {
  const out = { ...a };
  ['total', 'done', 'doing', 'todo', 'overdue', 'onTime', 'late', 'points'].forEach((k) => { out[k] = (a[k] || 0) + b[k]; });
  out.percent = out.total ? Math.round(out.points / out.total) : 0;
  return out;
}

const assignedTo = (tasks, userId) => tasks.filter((t) => t.assignees.some((a) => a.id === userId));

module.exports = {
  personStats, addStats, assignedTo, taskPercent,
};
