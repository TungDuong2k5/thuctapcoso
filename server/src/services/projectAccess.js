const { Project, ProjectMember } = require('../models');
const { HttpError } = require('../utils/http');

// Trả về vai trò của user trong dự án ('leader' | 'member'), hoặc báo lỗi 403/404.
// Admin hệ thống được xem như trưởng nhóm ở mọi dự án.
async function getRole(projectId, user) {
  const project = await Project.findByPk(projectId);
  if (!project) throw new HttpError(404, 'Không tìm thấy dự án');
  if (user.systemRole === 'admin') return 'leader';
  const membership = await ProjectMember.findOne({ where: { projectId, userId: user.id } });
  if (!membership) throw new HttpError(403, 'Bạn không phải thành viên của dự án này');
  return membership.role;
}

async function requireLeader(projectId, user) {
  const role = await getRole(projectId, user);
  if (role !== 'leader') throw new HttpError(403, 'Chỉ trưởng nhóm được thực hiện thao tác này');
  return role;
}

async function assertMember(projectId, userId) {
  if (!userId) return;
  const membership = await ProjectMember.findOne({ where: { projectId, userId } });
  if (!membership) throw new HttpError(400, 'Người được giao không thuộc dự án');
}

async function leaderIds(projectId) {
  const leaders = await ProjectMember.findAll({ where: { projectId, role: 'leader' } });
  return leaders.map((l) => l.userId);
}

module.exports = { getRole, requireLeader, assertMember, leaderIds };
