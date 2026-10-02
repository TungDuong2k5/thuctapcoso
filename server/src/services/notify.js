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

module.exports = { notify };
