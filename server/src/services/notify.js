const { Op } = require('sequelize');
const { Notification } = require('../models');
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

module.exports = { notify, resolveUrgent, URGENT_TYPES };
