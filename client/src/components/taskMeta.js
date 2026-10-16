// Hằng số và hàm dùng chung cho các chế độ xem công việc (Kanban / Danh sách / Lịch)
export const COLUMNS = [
  { key: 'todo', label: 'To do' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
];
// Chỉ còn 2 mức: việc thường và việc khẩn cấp
export const isUrgentTask = (t) => t.priority === 'urgent';
// Hai cột chỉ vào được bằng nút (Gửi báo cáo / Đạt), không kéo thả tay
export const LOCKED = ['review', 'done'];

export const todayISO = () => new Date().toLocaleDateString('sv-SE');
export const viDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

// Hạn nộp = ngày + giờ (giờ Việt Nam); không đặt giờ thì hết ngày 23:59
export function deadlineOf(t) {
  if (!t.dueDate) return null;
  return new Date(`${t.dueDate}T${t.dueTime || '23:59'}:${t.dueTime ? '00' : '59'}+07:00`);
}
export const isOverdue = (t) => !['done', 'review'].includes(t.status) && t.dueDate && deadlineOf(t) < new Date();
// "17:00 10/10" hoặc "10/10/2026"
export function formatDeadline(t, short = false) {
  if (!t.dueDate) return '';
  const day = short ? viDate(t.dueDate).slice(0, 5) : viDate(t.dueDate);
  return t.dueTime ? `${t.dueTime} ${day}` : day;
}
// 1590 phút → "1 ngày 2 giờ"
export function formatDuration(minutes) {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  return [d && `${d} ngày`, h && `${h} giờ`, m && !d && `${m} phút`].filter(Boolean).join(' ') || '1 phút';
}
// % hoàn thành của 1 công việc (giống cách tính ở máy chủ)
export function taskPercent(t) {
  if (t.status === 'done') return 100;
  if (t.status === 'review') return 90;
  if (t.status === 'in_progress') return Math.min(90, Math.max(10, t.progress || 0));
  return 0;
}
// Màu theo tiến độ: xanh = đúng tiến độ, vàng = chậm tiến độ (có việc quá hạn / nộp muộn), xám = chưa có việc
export const paceTone = (s) => (!s || !s.total ? 'none' : (s.overdue > 0 || s.late > 0 ? 'late' : 'ontime'));
// Một công việc: quá hạn hoặc nộp muộn → chậm tiến độ
export const taskPace = (t) => (isOverdue(t) || t.submittedLateMinutes > 0 ? 'late' : 'ontime');
// Màu thanh tiến độ theo % (cũ)
export const percentTone = (p) => (p >= 100 ? 'full' : p >= 70 ? 'high' : p >= 30 ? 'mid' : 'low');

// Nhãn nộp muộn của lần gửi báo cáo gần nhất
export const lateLabel = (t) => (t.submittedLateMinutes > 0 ? `Nộp muộn ${formatDuration(t.submittedLateMinutes)}` : '');
