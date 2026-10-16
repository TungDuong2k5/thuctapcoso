const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  sequelize, Project, ProjectMember, User, Invitation, Task, TaskLabel, Attachment, Label, PROJECT_ROLES,
} = require('../models');
const { addDefaultLabels } = require('../config/schema');
const { removeStoredFile } = require('../middlewares/upload');
const { emitToProject } = require('../sockets');
const { getRole, requireLeader } = require('../services/projectAccess');
const { joinProject } = require('../services/membership');
const { notify, resolveUrgent } = require('../services/notify');
const { personStats, assignedTo } = require('../services/progress');
const { HttpError } = require('../utils/http');

const memberAttrs = ['id', 'fullName', 'email', 'avatarUrl'];
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
    // GROUP BY theo tên cột thật (SQL Server không cho GROUP BY theo tên rút gọn "projectId")
    group: [sequelize.col('project_id'), sequelize.col('status')],
    raw: true,
  }) : [];

  // Ngày xong công việc cuối cùng của từng dự án (để biết dự án xong đúng hay chậm tiến độ)
  const lastDone = projects.length ? await Task.findAll({
    where: { projectId: projects.map((p) => p.id), status: 'done' },
    attributes: ['projectId', [sequelize.fn('MAX', sequelize.col('completed_at')), 'at']],
    group: [sequelize.col('project_id')],
    raw: true,
  }) : [];

  res.json(projects.map((p) => {
    const json = p.toJSON();
    json.myRole = json.ProjectMember?.role || 'leader';
    delete json.ProjectMember;
    json.progress = projectProgress(counts.filter((c) => c.projectId === p.id));
    json.finish = projectFinish(json, lastDone.find((x) => x.projectId === p.id)?.at);
    return json;
  }));
}

// Dự án đã hoàn thành chưa, xong ngày nào, có chậm so với ngày kết thúc dự án không
// (đánh dấu "Đã hoàn thành" → lấy lúc đánh dấu; mọi việc đều Done → lấy ngày xong việc cuối cùng)
function projectFinish(project, lastDoneAt) {
  const finished = project.status === 'archived' || project.progress.state === 'completed';
  if (!finished) return { finished: false };
  const at = project.status === 'archived' ? (project.completedAt || project.updatedAt) : lastDoneAt;
  const day = at ? new Date(at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }) : null;
  const lateDays = project.endDate && day && day > project.endDate
    ? Math.round((new Date(`${day}T00:00:00Z`) - new Date(`${project.endDate}T00:00:00Z`)) / 864e5)
    : 0;
  return {
    finished: true, finishedOn: day, late: lateDays > 0, lateDays,
  };
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
    await addDefaultLabels(p.id, t);
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
      { model: Label, as: 'labels', attributes: ['id', 'name', 'color'] },
    ],
    order: [[{ model: Label, as: 'labels' }, 'id', 'ASC']],
  });
  const json = project.toJSON();
  const tasks = await Task.findAll({
    where: { projectId: project.id },
    attributes: ['id', 'status', 'progress', 'dueDate', 'dueTime', 'submittedLateMinutes'],
    include: [{ model: User, as: 'assignees', attributes: ['id'], through: { attributes: [] } }],
  });
  json.members = json.members.map(({ ProjectMember: pm, ...u }) => ({
    ...u,
    role: pm.role,
    joinedAt: pm.createdAt,
    stats: personStats(assignedTo(tasks, u.id)),
  }));
  // Thành viên / khách chỉ xem tiến độ của chính mình, trưởng nhóm theo dõi được tất cả
  if (myRole !== 'leader') json.members.forEach((m) => { if (m.id !== req.user.id) delete m.stats; });
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
  if (status === 'archived' && project.status !== 'archived') changes.completedAt = new Date();
  if (status === 'active') changes.completedAt = null;
  await project.update(changes);
  // Dự án đã hoàn thành → tắt mọi thông báo khẩn của dự án
  if (status === 'archived') await resolveUrgent({ projectId: project.id });
  res.json(project);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Trưởng nhóm nhập 1 hoặc nhiều email (cách nhau bởi dấu phẩy, khoảng trắng, xuống dòng).
// Mỗi email nhận một LỜI MỜI; người được mời tự bấm Tham gia hoặc Từ chối.
// Email đã có tài khoản thì nhận thông báo ngay; chưa có thì thấy lời mời sau khi đăng ký.
async function addMembers(req, res) {
  const projectId = Number(req.params.id);
  await requireLeader(projectId, req.user);
  const { role = 'member' } = req.body;
  if (!PROJECT_ROLES.includes(role)) throw new HttpError(400, 'Vai trò không hợp lệ');

  const emails = [...new Set(String(req.body.emails ?? req.body.email ?? '')
    .split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!emails.length) throw new HttpError(400, 'Vui lòng nhập ít nhất một email');

  const project = await Project.findByPk(projectId);
  const results = [];
  for (const email of emails) {
    if (!EMAIL_RE.test(email)) {
      results.push({ email, status: 'invalid' });
      continue;
    }
    const user = await User.findOne({ where: { email } });
    if (user && !user.isActive) {
      results.push({ email, status: 'inactive' });
      continue;
    }
    if (user && await ProjectMember.findOne({ where: { projectId, userId: user.id } })) {
      results.push({ email, status: 'already' });
      continue;
    }
    const existing = await Invitation.findOne({ where: { projectId, email, status: 'pending' } });
    if (existing) {
      results.push({ email, status: 'already_invited', token: existing.token });
      continue;
    }
    const invite = await Invitation.create({
      projectId, email, role, token: crypto.randomBytes(24).toString('hex'), invitedBy: req.user.id,
    });
    if (user) {
      await notify(user.id, req.user.id, {
        type: 'project_invite',
        message: `${req.user.fullName} mời bạn tham gia dự án "${project.name}". Bấm để Tham gia / Từ chối`,
        link: '/',
      });
    }
    results.push({ email, status: user ? 'invited' : 'invited_new', token: invite.token });
  }
  res.status(201).json({ results });
}

// Lời mời đang chờ của chính người đang đăng nhập (hiện ở trang Dự án của tôi)
async function myInvitations(req, res) {
  if (!req.user.email) return res.json([]);
  const invites = await Invitation.findAll({
    where: { email: req.user.email, status: 'pending' },
    include: [
      { model: Project, attributes: ['id', 'name', 'description'], where: { status: 'active' } },
      { model: User, as: 'inviter', attributes: ['id', 'fullName'] },
    ],
    order: [['id', 'DESC']],
  });
  res.json(invites.map((i) => ({
    id: i.id, token: i.token, role: i.role, createdAt: i.createdAt, project: i.Project, inviterName: i.inviter?.fullName,
  })));
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
    token: invite.token,
    email: invite.email,
    role: invite.role,
    status: invite.status,
    project: invite.Project,
    inviterName: invite.inviter?.fullName,
  });
}

async function loadOwnInvitation(req) {
  const invite = await Invitation.findOne({
    where: { token: req.params.token },
    include: [{ model: Project, attributes: ['id', 'name'] }],
  });
  if (!invite || invite.status === 'cancelled') throw new HttpError(404, 'Lời mời không hợp lệ hoặc đã bị hủy');
  // Lời mời chỉ dành cho đúng email được mời
  if (invite.email !== req.user.email) {
    throw new HttpError(403, `Lời mời này dành cho ${invite.email}. Bạn đang đăng nhập bằng ${req.user.email}, hãy đăng xuất rồi đăng nhập/đăng ký bằng ${invite.email}.`);
  }
  if (invite.status === 'declined') throw new HttpError(400, 'Bạn đã từ chối lời mời này');
  return invite;
}

// Bấm "Tham gia": vào dự án, báo trưởng nhóm
async function acceptInvitation(req, res) {
  const invite = await loadOwnInvitation(req);
  await joinProject(invite.projectId, req.user, invite.role); // tự báo trưởng nhóm "đã tham gia"
  if (invite.status === 'pending') await invite.update({ status: 'accepted' });
  res.json({ projectId: invite.projectId });
}

// Bấm "Từ chối": hủy lời mời, báo người mời
async function declineInvitation(req, res) {
  const invite = await loadOwnInvitation(req);
  if (invite.status === 'accepted') throw new HttpError(400, 'Bạn đã tham gia dự án này');
  await invite.update({ status: 'declined' });
  await notify(invite.invitedBy, req.user.id, {
    type: 'invite_declined',
    message: `${req.user.fullName} đã từ chối lời mời tham gia dự án "${invite.Project?.name}"`,
    link: `/projects/${invite.projectId}/members`,
  });
  res.json({ success: true });
}

async function removeMember(req, res) {
  await requireLeader(req.params.id, req.user);
  const project = await Project.findByPk(req.params.id);
  if (Number(req.params.userId) === project.ownerId) throw new HttpError(400, 'Không thể xóa người tạo dự án');
  const removed = await ProjectMember.destroy({ where: { projectId: project.id, userId: req.params.userId } });
  if (!removed) throw new HttpError(404, 'Thành viên không tồn tại');
  res.json({ success: true });
}

// Trưởng nhóm đổi vai trò: trưởng nhóm / thành viên / khách (chỉ xem)
async function updateMemberRole(req, res) {
  await requireLeader(req.params.id, req.user);
  const { role } = req.body;
  if (!PROJECT_ROLES.includes(role)) throw new HttpError(400, 'Vai trò không hợp lệ');
  const project = await Project.findByPk(req.params.id);
  const userId = Number(req.params.userId);
  if (userId === project.ownerId && role !== 'leader') throw new HttpError(400, 'Người tạo dự án luôn là trưởng nhóm');
  const membership = await ProjectMember.findOne({ where: { projectId: project.id, userId } });
  if (!membership) throw new HttpError(404, 'Thành viên không tồn tại');
  if (role === 'guest' && await Task.count({
    where: {
      projectId: project.id,
      status: { [Op.ne]: 'done' },
      id: { [Op.in]: sequelize.literal(`(SELECT task_id FROM task_assignees WHERE user_id = ${userId})`) },
    },
  })) {
    throw new HttpError(400, 'Người này đang được giao việc chưa xong, hãy giao lại trước khi chuyển thành khách');
  }
  await membership.update({ role });
  const label = { leader: 'trưởng nhóm', member: 'thành viên', guest: 'khách (chỉ xem)' }[role];
  await notify(userId, req.user.id, {
    type: 'role_changed',
    message: `Vai trò của bạn trong dự án "${project.name}" đã đổi thành ${label}`,
    link: `/projects/${project.id}`,
  });
  emitToProject(project.id, 'project:changed', {});
  res.json({ success: true });
}

// Xóa hẳn dự án: chỉ người tạo (hoặc admin), phải gõ đúng tên dự án để xác nhận
async function remove(req, res) {
  const project = await Project.findByPk(req.params.id);
  if (!project) throw new HttpError(404, 'Không tìm thấy dự án');
  if (project.ownerId !== req.user.id && req.user.systemRole !== 'admin') {
    throw new HttpError(403, 'Chỉ người tạo dự án được xóa dự án');
  }
  if (String(req.body?.confirmName ?? '').trim() !== project.name) {
    throw new HttpError(400, 'Tên xác nhận không khớp với tên dự án');
  }
  const members = await ProjectMember.findAll({ where: { projectId: project.id } });
  const tasks = await Task.findAll({ where: { projectId: project.id }, attributes: ['id'] });
  const taskIds = tasks.map((t) => t.id);
  const files = taskIds.length ? await Attachment.findAll({ where: { taskId: taskIds }, attributes: ['storedName'] }) : [];

  await sequelize.transaction(async (t) => {
    if (taskIds.length) await TaskLabel.destroy({ where: { taskId: taskIds }, transaction: t });
    await project.destroy({ transaction: t }); // các bảng con xóa dây chuyền theo khóa ngoại
  });
  files.forEach((f) => removeStoredFile(f.storedName));

  await notify(members.map((m) => m.userId), req.user.id, {
    type: 'project_deleted',
    message: `${req.user.fullName} đã xóa dự án "${project.name}"`,
    link: '/',
  });
  emitToProject(project.id, 'project:deleted', { id: project.id });
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
  updateMemberRole,
  remove,
  searchUsers,
  listInvitations,
  cancelInvitation,
  invitationInfo,
  acceptInvitation,
  declineInvitation,
  myInvitations,
};
