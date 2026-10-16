// Hạn nộp = ngày + giờ (giờ Việt Nam). Không đặt giờ thì hạn là hết ngày (23:59).
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function deadlineOf(task) {
  if (!task.dueDate) return null;
  return task.dueTime
    ? new Date(`${task.dueDate}T${task.dueTime}:00+07:00`)
    : new Date(`${task.dueDate}T23:59:59+07:00`);
}

// Số phút nộp muộn so với hạn (0 = đúng hạn hoặc không có hạn)
function lateMinutes(task, at = new Date()) {
  const deadline = deadlineOf(task);
  if (!deadline) return 0;
  const ms = new Date(at) - deadline;
  return ms > 0 ? Math.max(1, Math.ceil(ms / 60000)) : 0;
}

// 1590 → "1 ngày 2 giờ 30 phút"
function formatDuration(minutes) {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  return [d && `${d} ngày`, h && `${h} giờ`, m && !d && `${m} phút`].filter(Boolean).join(' ') || '1 phút';
}

// "10/10/2026 17:00" (không đặt giờ thì chỉ hiện ngày)
function formatDeadline(task) {
  if (!task.dueDate) return '';
  const day = task.dueDate.split('-').reverse().join('/');
  return task.dueTime ? `${task.dueTime} ${day}` : day;
}

module.exports = {
  TIME_RE, deadlineOf, lateMinutes, formatDuration, formatDeadline,
};
