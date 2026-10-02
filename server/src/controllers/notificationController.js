const { Notification } = require('../models');

async function list(req, res) {
  const items = await Notification.findAll({
    where: { userId: req.user.id },
    order: [['id', 'DESC']],
    limit: 30,
  });
  const unread = await Notification.count({ where: { userId: req.user.id, isRead: false } });
  res.json({ items, unread });
}

async function markRead(req, res) {
  const where = { userId: req.user.id };
  if (req.params.id) where.id = req.params.id;
  await Notification.update({ isRead: true }, { where });
  res.json({ success: true });
}

module.exports = { list, markRead };
