const { Project, ProjectMember, Invitation } = require('../models');
const { leaderIds } = require('./projectAccess');
const { notify } = require('./notify');

// Thêm user vào dự án. Trả về false nếu đã là thành viên.
async function joinProject(projectId, user, role, actorId) {
  const existing = await ProjectMember.findOne({ where: { projectId, userId: user.id } });
  if (existing) return false;

  await ProjectMember.create({ projectId, userId: user.id, role });
  const project = await Project.findByPk(projectId);
  if (actorId && actorId !== user.id) {
    await notify(user.id, actorId, {
      type: 'project_invite',
      message: `Bạn đã được thêm vào dự án "${project.name}"`,
      link: `/projects/${projectId}`,
    });
  }
  await notify(await leaderIds(projectId), user.id, {
    type: 'member_joined',
    message: `${user.fullName} đã tham gia dự án "${project.name}"`,
    link: `/projects/${projectId}/members`,
  });
  return true;
}

// Gọi khi tài khoản mới được tạo: báo các lời mời đang chờ gửi tới email này
// (người dùng tự bấm Tham gia / Từ chối ở trang Dự án của tôi)
async function notifyPendingInvites(user) {
  if (!user.email) return 0;
  const invites = await Invitation.findAll({
    where: { email: user.email, status: 'pending' },
    include: [{ model: Project, attributes: ['name'] }],
  });
  for (const inv of invites) {
    await notify(user.id, inv.invitedBy, {
      type: 'project_invite',
      message: `Bạn được mời tham gia dự án "${inv.Project?.name}". Bấm để Tham gia / Từ chối`,
      link: '/',
    });
  }
  return invites.length;
}

module.exports = { joinProject, notifyPendingInvites };
