const { Label, TaskLabel } = require('../models');
const { getRole, requireLeader } = require('../services/projectAccess');
const { emitToProject } = require('../sockets');
const { HttpError } = require('../utils/http');

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function readLabel(body, partial) {
  const out = {};
  if (body.name !== undefined || !partial) {
    const name = String(body.name || '').trim();
    if (!name) throw new HttpError(400, 'Nhập tên nhãn');
    if (name.length > 30) throw new HttpError(400, 'Tên nhãn tối đa 30 ký tự');
    out.name = name;
  }
  if (body.color !== undefined) {
    if (!COLOR_RE.test(body.color)) throw new HttpError(400, 'Màu không hợp lệ');
    out.color = body.color;
  }
  return out;
}

async function assertUniqueName(projectId, name, exceptId) {
  const same = await Label.findOne({ where: { projectId, name } });
  if (same && same.id !== exceptId) throw new HttpError(400, 'Đã có nhãn trùng tên');
}

async function list(req, res) {
  await getRole(req.params.projectId, req.user);
  res.json(await Label.findAll({ where: { projectId: req.params.projectId }, order: [['id', 'ASC']] }));
}

// Chỉ trưởng nhóm quản lý bộ nhãn của dự án
async function create(req, res) {
  const { projectId } = req.params;
  await requireLeader(projectId, req.user);
  const data = readLabel(req.body, false);
  await assertUniqueName(projectId, data.name);
  if (await Label.count({ where: { projectId } }) >= 30) throw new HttpError(400, 'Tối đa 30 nhãn mỗi dự án');
  const label = await Label.create({ projectId, ...data });
  emitToProject(projectId, 'task:changed', {});
  emitToProject(projectId, 'project:changed', {});
  res.status(201).json(label);
}

async function loadLabel(req) {
  const label = await Label.findByPk(req.params.id);
  if (!label) throw new HttpError(404, 'Không tìm thấy nhãn');
  await requireLeader(label.projectId, req.user);
  return label;
}

async function update(req, res) {
  const label = await loadLabel(req);
  const data = readLabel(req.body, true);
  if (data.name) await assertUniqueName(label.projectId, data.name, label.id);
  await label.update(data);
  emitToProject(label.projectId, 'task:changed', {});
  emitToProject(label.projectId, 'project:changed', {});
  res.json(label);
}

async function remove(req, res) {
  const label = await loadLabel(req);
  await TaskLabel.destroy({ where: { labelId: label.id } }); // gỡ nhãn khỏi các công việc trước
  await label.destroy();
  emitToProject(label.projectId, 'task:changed', {});
  emitToProject(label.projectId, 'project:changed', {});
  res.json({ success: true });
}

module.exports = {
  list, create, update, remove,
};
