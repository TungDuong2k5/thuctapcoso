const { Op } = require('sequelize');
const { Notification, Task, Project } = require('../models');
const { emitToUser } = require('../sockets');

// Lưu thông báo vào DB rồi đẩy realtime tới người nhận.
// Bỏ qua người nhận trùng nhau và không tự thông báo cho người thực hiện.
async function notify(userIds, actorId, { type, message, link }) {
  const targets = [...new Set([].concat(userIds))].filter((id) => id && id !== actorId);
  for (const userId of targets) {
    const text = message.length > 250 ? `${message.slice(0, 247)}...` : message;
    const n = await Notification.create({ userId, type, message: text, link });
    emitToUser(userId, 'notification:new', n);
  }
}

// Các thông báo khẩn (đến hạn / quá hạn)
const URGENT_TYPES = ['deadline_today', 'deadline_overdue'];

// Việc đã nộp / đã xong hoặc dự án đã hoàn thành → tắt các thông báo khẩn liên quan (đánh dấu đã đọc)
// và báo cho trình duyệt để cửa sổ cảnh báo tự biến mất
async function resolveUrgent({ taskId, projectId }) {
  const link = taskId ? { [Op.like]: `%?task=${taskId}` } : { [Op.like]: `/projects/${projectId}?%` };
  const rows = await Notification.findAll({ where: { isRead: false, type: URGENT_TYPES, link } });
  if (!rows.length) return 0;
  await Notification.update({ isRead: true }, { where: { id: rows.map((r) => r.id) } });
  const byUser = {};
  rows.forEach((r) => { (byUser[r.userId] = byUser[r.userId] || []).push(r.id); });
  Object.entries(byUser).forEach(([userId, ids]) => emitToUser(Number(userId), 'notification:resolved', { ids }));
  return rows.length;
}

// Dọn thông báo khẩn đã lỗi thời của một người (VD tạo trước khi có tính năng tự tắt, công việc đã bị xóa):
// việc đã nộp / đã xong / đã xóa hoặc dự án đã hoàn thành → đánh dấu đã đọc để không còn báo khẩn
async function pruneStaleUrgent(userId) {
  const rows = await Notification.findAll({ where: { userId, isRead: false, type: URGENT_TYPES } });
  if (!rows.length) return 0;
  const taskIdOf = (n) => Number((/[?&]task=(\d+)/.exec(n.link || '') || [])[1]) || null;
  const ids = [...new Set(rows.map(taskIdOf).filter(Boolean))];
  const tasks = ids.length ? await Task.findAll({
    where: { id: ids },
    attributes: ['id', 'status', 'submittedAt'],
    include: [{ model: Project, attributes: ['status'] }],
  }) : [];
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
  const stale = rows.filter((n) => {
    const t = byId[taskIdOf(n)];
    if (!t) return true;
    return ['review', 'done'].includes(t.status) || t.Project?.status === 'archived';
  });
  if (!stale.length) return 0;
  await Notification.update({ isRead: true }, { where: { id: stale.map((n) => n.id) } });
  return stale.length;
}

module.exports = {
  notify, resolveUrgent, pruneStaleUrgent, URGENT_TYPES,
};
