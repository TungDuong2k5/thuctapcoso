const { Op } = require('sequelize');
const {
  sequelize, Task, User, ProjectMember, DirectMessage,
} = require('../models');
const { assertCanEdit } = require('../services/projectAccess');
const { assertCanSeeTask } = require('../services/visibility');
const { getAssigneeIds } = require('../services/assignees');
const { notify } = require('../services/notify');
const { emitToUser } = require('../sockets');
const { HttpError } = require('../utils/http');

const userAttrs = ['id', 'fullName', 'avatarUrl'];

// Những người có thể nhắn riêng về công việc này: người được giao, người tạo, trưởng nhóm (trừ khách)
async function participants(task) {
  const members = await ProjectMember.findAll({ where: { projectId: task.projectId } });
  const roleOf = Object.fromEntries(members.map((m) => [m.userId, m.role]));
  const ids = new Set([...(await getAssigneeIds(task)), task.creatorId]);
  members.filter((m) => m.role === 'leader').forEach((m) => ids.add(m.userId));
  return { ids: [...ids].filter((id) => id && roleOf[id] && roleOf[id] !== 'guest'), roleOf };
}

async function loadTask(req) {
  const task = await Task.findByPk(req.params.id);
  if (!task) throw new HttpError(404, 'Không tìm thấy công việc');
  const role = await assertCanSeeTask(task, req.user);
  return { task, role };
}

async function loadPair(req) {
  const { task, role } = await loadTask(req);
  const otherId = Number(req.params.userId);
  if (!otherId || otherId === req.user.id) throw new HttpError(400, 'Không thể nhắn cho chính mình');
  const { ids } = await participants(task);
  if (!ids.includes(otherId) || (!ids.includes(req.user.id) && role !== 'leader')) {
    throw new HttpError(403, 'Chỉ nhắn riêng được giữa những người liên quan đến công việc này');
  }
  return { task, role, otherId };
}

// Danh sách người có thể nhắn riêng (kèm số tin chưa đọc từ từng người)
async function contacts(req, res) {
  const { task, role } = await loadTask(req);
  if (role === 'guest') return res.json([]);
  const { ids, roleOf } = await participants(task);
  const others = ids.filter((id) => id !== req.user.id);
  if (!ids.includes(req.user.id) && role !== 'leader') return res.json([]);
  const users = others.length ? await User.findAll({ where: { id: others }, attributes: userAttrs }) : [];
  const unread = others.length ? await DirectMessage.findAll({
    where: { taskId: task.id, receiverId: req.user.id, readAt: null },
    attributes: [[sequelize.col('sender_id'), 'senderId'], [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
    group: [sequelize.col('sender_id')],
    raw: true,
  }) : [];
  const assignees = await getAssigneeIds(task);
  res.json(users.map((u) => ({
    ...u.toJSON(),
    role: roleOf[u.id],
    isAssignee: assignees.includes(u.id),
    unread: Number(unread.find((x) => x.senderId === u.id)?.n || 0),
  })));
}

// Tin nhắn giữa mình và một người về công việc này; mở ra là đánh dấu đã đọc
async function thread(req, res) {
  const { task, otherId } = await loadPair(req);
  const me = req.user.id;
  const messages = await DirectMessage.findAll({
    where: {
      taskId: task.id,
      [Op.or]: [{ senderId: me, receiverId: otherId }, { senderId: otherId, receiverId: me }],
    },
    order: [['id', 'ASC']],
    limit: 300,
  });
  await DirectMessage.update({ readAt: new Date() }, {
    where: {
      taskId: task.id, senderId: otherId, receiverId: me, readAt: null,
    },
  });
  emitToUser(me, 'dm:read', { taskId: task.id, userId: otherId });
  res.json(messages);
}

async function send(req, res) {
  const { task, role, otherId } = await loadPair(req);
  assertCanEdit(role);
  const content = String(req.body.content || '').trim();
  if (!content) throw new HttpError(400, 'Tin nhắn trống');
  if (content.length > 2000) throw new HttpError(400, 'Tin nhắn tối đa 2000 ký tự');
  const msg = await DirectMessage.create({
    taskId: task.id, senderId: req.user.id, receiverId: otherId, content,
  });
  const payload = { ...msg.toJSON(), senderName: req.user.fullName, taskTitle: task.title };
  emitToUser(otherId, 'dm:new', payload);
  emitToUser(req.user.id, 'dm:new', payload); // các tab khác của chính mình
  await notify(otherId, req.user.id, {
    type: 'dm',
    message: `💬 ${req.user.fullName} nhắn riêng về "${task.title}": ${content}`,
    link: `/projects/${task.projectId}?task=${task.id}&dm=${req.user.id}`,
  });
  res.status(201).json(msg);
}

// Số tin nhắn riêng chưa đọc theo từng công việc (hiện biểu tượng trên thẻ Kanban)
async function unreadByTask(userId, taskIds) {
  if (!taskIds.length) return {};
  const rows = await DirectMessage.findAll({
    where: { receiverId: userId, readAt: null, taskId: taskIds },
    attributes: [[sequelize.col('task_id'), 'taskId'], [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
    group: [sequelize.col('task_id')],
    raw: true,
  });
  return Object.fromEntries(rows.map((r) => [r.taskId, Number(r.n)]));
}

module.exports = {
  contacts, thread, send, unreadByTask,
};
