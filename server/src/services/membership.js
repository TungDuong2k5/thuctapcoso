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

// Gọi khi đăng ký: nhận tất cả lời mời đang chờ gửi tới email này
async function acceptPendingByEmail(user) {
  const invites = await Invitation.findAll({ where: { email: user.email, status: 'pending' } });
  for (const inv of invites) {
    await joinProject(inv.projectId, user, inv.role);
    await inv.update({ status: 'accepted' });
  }
  return invites.length;
}

module.exports = { joinProject, acceptPendingByEmail };
