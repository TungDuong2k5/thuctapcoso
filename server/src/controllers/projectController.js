const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  sequelize, Project, ProjectMember, User, Invitation, Task,
} = require('../models');
const { getRole, requireLeader } = require('../services/projectAccess');
const { joinProject } = require('../services/membership');
const { HttpError } = require('../utils/http');

const memberAttrs = ['id', 'fullName', 'email'];
// Thông tin hiển thị ở tab Thành viên (chỉ người trong dự án xem được)
const profileAttrs = [...memberAttrs, 'studentCode', 'className', 'phone', 'dateOfBirth', 'bio'];

async function list(req, res) {
  const where = req.query.archived === '1' ? {} : { status: 'active' };
  const projects = req.user.systemRole === 'admin'
    ? await Project.findAll({ where, include: [{ model: User, as: 'owner', attributes: memberAttrs }], order: [['id', 'DESC']] })
    : await req.user.getProjects({ where, include: [{ model: User, as: 'owner', attributes: memberAttrs }], order: [['id', 'DESC']] });
  // Đếm số công việc theo trạng thái của tất cả dự án trong 1 truy vấn
  const counts = projects.length ? await Task.findAll({
    where: { projectId: projects.map((p) => p.id) },
    attributes: ['projectId', 'status', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
    group: ['projectId', 'status'],
    raw: true,
  }) : [];

  res.json(projects.map((p) => {
    const json = p.toJSON();
    json.myRole = json.ProjectMember?.role || 'leader';
    delete json.ProjectMember;
    json.progress = projectProgress(counts.filter((c) => c.projectId === p.id));
    return json;
  }));
}

// % hoàn thành + số việc Đã làm (Done) / Đang làm (In progress, Review) / Chuẩn bị làm (To do)
function projectProgress(rows) {
  const by = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  const done = by.done || 0;
  const doing = (by.in_progress || 0) + (by.review || 0);
  const todo = by.todo || 0;
  const total = done + doing + todo;
  let state = 'not_started';
  if (total > 0 && done === total) state = 'completed';
  else if (done + doing > 0) state = 'in_progress';
  return {
    total, done, doing, todo, percent: total ? Math.round((done / total) * 100) : 0, state,
  };
}

async function create(req, res) {
  const { name, description, startDate, endDate } = req.body;
  if (!name?.trim()) throw new HttpError(400, 'Vui lòng nhập tên dự án');
  if (startDate && endDate && startDate > endDate) throw new HttpError(400, 'Ngày kết thúc phải sau ngày bắt đầu');

  const project = await sequelize.transaction(async (t) => {
    const p = await Project.create({
      name: name.trim(), description, startDate: startDate || null, endDate: endDate || null, ownerId: req.user.id,
    }, { transaction: t });
    await ProjectMember.create({ projectId: p.id, userId: req.user.id, role: 'leader' }, { transaction: t });
    return p;
  });
  res.status(201).json(project);
}

async function detail(req, res) {
  const myRole = await getRole(req.params.id, req.user);
  const project = await Project.findByPk(req.params.id, {
    include: [
      { model: User, as: 'owner', attributes: memberAttrs },
      { model: User, as: 'members', attributes: profileAttrs, through: { attributes: ['role', 'createdAt'] } },
    ],
  });
  const json = project.toJSON();
  const tasks = await Task.findAll({
    where: { projectId: project.id },
    attributes: ['id', 'status', 'dueDate'],
    include: [{ model: User, as: 'assignees', attributes: ['id'], through: { attributes: [] } }],
  });
  const today = new Date().toISOString().slice(0, 10);
  json.members = json.members.map(({ ProjectMember: pm, ...u }) => {
    const mine = tasks.filter((t) => t.assignees.some((a) => a.id === u.id));
    return {
      ...u,
      role: pm.role,
      joinedAt: pm.createdAt,
      stats: {
        total: mine.length,
        done: mine.filter((t) => t.status === 'done').length,
        overdue: mine.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < today).length,
      },
    };
  });
  json.myRole = myRole;
  res.json(json);
}

async function update(req, res) {
  await requireLeader(req.params.id, req.user);
  const project = await Project.findByPk(req.params.id);
  const { name, description, startDate, endDate, status } = req.body;
  if (name !== undefined && !name.trim()) throw new HttpError(400, 'Tên dự án không được để trống');
  if (status !== undefined && !['active', 'archived'].includes(status)) throw new HttpError(400, 'Trạng thái không hợp lệ');
  const changes = { name: name?.trim(), description, startDate, endDate, status };
  Object.keys(changes).forEach((k) => changes[k] === undefined && delete changes[k]);
  await project.update(changes);
  res.json(project);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Trưởng nhóm nhập 1 hoặc nhiều email (cách nhau bởi dấu phẩy, khoảng trắng, xuống dòng):
// - email đã có tài khoản → vào dự án ngay
// - email chưa có tài khoản → tạo lời mời; người đó đăng ký bằng email này là tự vào dự án
async function addMembers(req, res) {
  const projectId = Number(req.params.id);
  await requireLeader(projectId, req.user);
  const { role = 'member' } = req.body;
  if (!['leader', 'member'].includes(role)) throw new HttpError(400, 'Vai trò không hợp lệ');

  const emails = [...new Set(String(req.body.emails ?? req.body.email ?? '')
    .split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!emails.length) throw new HttpError(400, 'Vui lòng nhập ít nhất một email');

  const results = [];
  for (const email of emails) {
    if (!EMAIL_RE.test(email)) {
      results.push({ email, status: 'invalid' });
      continue;
    }
    const user = await User.findOne({ where: { email } });
    if (user && !user.isActive) {
      results.push({ email, status: 'inactive' });
    } else if (user) {
      const joined = await joinProject(projectId, user, role, req.user.id);
      results.push({ email, status: joined ? 'added' : 'already' });
    } else {
      let invite = await Invitation.findOne({ where: { projectId, email, status: 'pending' } });
      if (!invite) {
        invite = await Invitation.create({
          projectId, email, role, token: crypto.randomBytes(24).toString('hex'), invitedBy: req.user.id,
        });
      }
      results.push({ email, status: 'invited', token: invite.token });
    }
  }
  res.status(201).json({ results });
}

async function listInvitations(req, res) {
  await requireLeader(req.params.id, req.user);
  const invites = await Invitation.findAll({
    where: { projectId: req.params.id, status: 'pending' },
    include: [{ model: User, as: 'inviter', attributes: memberAttrs }],
    order: [['id', 'DESC']],
  });
  res.json(invites);
}

async function cancelInvitation(req, res) {
  const invite = await Invitation.findByPk(req.params.inviteId);
  if (!invite || invite.status !== 'pending') throw new HttpError(404, 'Lời mời không tồn tại');
  await requireLeader(invite.projectId, req.user);
  await invite.update({ status: 'cancelled' });
  res.json({ success: true });
}

// Trang mở link mời (chưa cần đăng nhập): hiện tên dự án, người mời
async function invitationInfo(req, res) {
  const invite = await Invitation.findOne({
    where: { token: req.params.token },
    include: [{ model: Project, attributes: ['id', 'name'] }, { model: User, as: 'inviter', attributes: ['fullName'] }],
  });
  if (!invite || invite.status === 'cancelled') throw new HttpError(404, 'Link mời không hợp lệ hoặc đã bị hủy');
  res.json({
    email: invite.email,
    role: invite.role,
    status: invite.status,
    project: invite.Project,
    inviterName: invite.inviter?.fullName,
  });
}

// Người đã đăng nhập bấm "Tham gia" trên trang link mời
async function acceptInvitation(req, res) {
  const invite = await Invitation.findOne({ where: { token: req.params.token } });
  if (!invite || invite.status === 'cancelled') throw new HttpError(404, 'Link mời không hợp lệ hoặc đã bị hủy');
  // Link chỉ dành cho đúng email được mời, tránh người khác bấm làm "hết hạn" lời mời
  if (invite.email !== req.user.email) {
    throw new HttpError(403, `Link này dành cho ${invite.email}. Bạn đang đăng nhập bằng ${req.user.email}, hãy đăng xuất rồi đăng nhập/đăng ký bằng ${invite.email}.`);
  }
  await joinProject(invite.projectId, req.user, invite.role);
  if (invite.status === 'pending') await invite.update({ status: 'accepted' });
  res.json({ projectId: invite.projectId });
}

async function removeMember(req, res) {
  await requireLeader(req.params.id, req.user);
  const project = await Project.findByPk(req.params.id);
  if (Number(req.params.userId) === project.ownerId) throw new HttpError(400, 'Không thể xóa người tạo dự án');
  const removed = await ProjectMember.destroy({ where: { projectId: project.id, userId: req.params.userId } });
  if (!removed) throw new HttpError(404, 'Thành viên không tồn tại');
  res.json({ success: true });
}

async function searchUsers(req, res) {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  const users = await User.findAll({
    where: { isActive: true, [Op.or]: [{ email: { [Op.like]: `%${q}%` } }, { fullName: { [Op.like]: `%${q}%` } }] },
    attributes: memberAttrs,
    limit: 10,
  });
  res.json(users);
}

module.exports = {
  list,
  create,
  detail,
  update,
  addMembers,
  removeMember,
  searchUsers,
  listInvitations,
  cancelInvitation,
  invitationInfo,
  acceptInvitation,
};
