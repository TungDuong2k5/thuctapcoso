const { Op } = require('sequelize');
const { ChatMessage, User } = require('../models');
const { getRole, assertCanEdit } = require('../services/projectAccess');
const { emitToProject } = require('../sockets');
const { HttpError } = require('../utils/http');

const authorInclude = { model: User, as: 'author', attributes: ['id', 'fullName', 'avatarUrl'] };
const PAGE = 50;

// 50 tin gần nhất (cuộn lên để tải tin cũ hơn bằng ?before=<id>)
async function list(req, res) {
  const { projectId } = req.params;
  await getRole(projectId, req.user);
  const where = { projectId };
  if (req.query.before) where.id = { [Op.lt]: Number(req.query.before) || 0 };
  const rows = await ChatMessage.findAll({
    where, include: [authorInclude], order: [['id', 'DESC']], limit: PAGE,
  });
  res.json({ items: rows.reverse(), hasMore: rows.length === PAGE });
}

async function send(req, res) {
  const { projectId } = req.params;
  assertCanEdit(await getRole(projectId, req.user)); // khách chỉ đọc
  const content = String(req.body.content || '').trim();
  if (!content) throw new HttpError(400, 'Tin nhắn trống');
  if (content.length > 2000) throw new HttpError(400, 'Tin nhắn tối đa 2000 ký tự');
  const msg = await ChatMessage.create({ projectId, userId: req.user.id, content });
  const full = await ChatMessage.findByPk(msg.id, { include: [authorInclude] });
  emitToProject(projectId, 'chat:new', full);
  res.status(201).json(full);
}

module.exports = { list, send };
