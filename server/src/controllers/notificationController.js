const { Op } = require('sequelize');
const { Notification } = require('../models');
const { URGENT_TYPES } = require('../services/deadlines');

async function list(req, res) {
  const items = await Notification.findAll({
    where: { userId: req.user.id },
    order: [['id', 'DESC']],
    limit: 30,
  });
  const unread = await Notification.count({ where: { userId: req.user.id, isRead: false } });
  // Thông báo khẩn chưa đọc (trễ / hết hạn hôm nay) để giao diện bật cửa sổ cảnh báo
  const urgent = await Notification.findAll({
    where: { userId: req.user.id, isRead: false, type: { [Op.in]: URGENT_TYPES } },
    order: [['id', 'DESC']],
    limit: 20,
  });
  res.json({ items, unread, urgent });
}

async function markRead(req, res) {
  const where = { userId: req.user.id };
  if (req.params.id) where.id = req.params.id;
  await Notification.update({ isRead: true }, { where });
  res.json({ success: true });
}

module.exports = { list, markRead };
