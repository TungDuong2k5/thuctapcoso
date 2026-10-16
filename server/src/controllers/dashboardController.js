const { Op } = require('sequelize');
const {
  sequelize, Project, ProjectMember, Task, User,
} = require('../models');

const taskAttrs = ['id', 'projectId', 'title', 'status', 'priority', 'progress', 'startDate', 'dueDate', 'dueTime', 'submittedAt', 'submittedLateMinutes', 'completedAt'];

// Trang chủ: số liệu nhanh, việc của tôi (chưa xong) và bài đang chờ tôi nhận xét, trên mọi dự án đang làm
async function dashboard(req, res) {
  const me = req.user.id;
  const memberships = await ProjectMember.findAll({ where: { userId: me } });
  const roleOf = Object.fromEntries(memberships.map((m) => [m.projectId, m.role]));
  const projects = memberships.length ? await Project.findAll({
    where: { id: Object.keys(roleOf).map(Number), status: 'active' },
    attributes: ['id', 'name'],
  }) : [];
  const pids = projects.map((p) => p.id);
  const nameOf = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  if (!pids.length) return res.json({ activeProjects: 0, myTasks: [], reviews: [] });

  const mine = await Task.findAll({
    where: {
      projectId: pids,
      status: { [Op.ne]: 'done' },
      id: { [Op.in]: sequelize.literal(`(SELECT task_id FROM task_assignees WHERE user_id = ${Number(me)})`) },
    },
    attributes: taskAttrs,
    order: [['dueDate', 'ASC'], ['id', 'ASC']],
  });

  // Bài đang ở Review mà tôi là người nhận xét:
  // bài thành viên → trưởng nhóm nhận xét; bài có trưởng nhóm cùng làm → các thành viên khác nhận xét
  const inReview = await Task.findAll({
    where: { projectId: pids, status: 'review' },
    attributes: taskAttrs,
    include: [{ model: User, as: 'assignees', attributes: ['id', 'fullName'], through: { attributes: [] } }],
  });
  const leaders = await ProjectMember.findAll({ where: { projectId: pids, role: 'leader' } });
  const leaderSet = new Set(leaders.map((l) => `${l.projectId}:${l.userId}`));
  const reviews = inReview.filter((t) => {
    const ids = t.assignees.map((a) => a.id);
    if (ids.includes(me) || roleOf[t.projectId] === 'guest') return false;
    const leaderWorks = ids.some((id) => leaderSet.has(`${t.projectId}:${id}`));
    return leaderWorks || roleOf[t.projectId] === 'leader';
  });

  const withProject = (t) => ({ ...t.toJSON(), projectName: nameOf[t.projectId] });
  res.json({
    activeProjects: pids.length,
    myTasks: mine.map(withProject),
    reviews: reviews.map((t) => ({ ...withProject(t), assigneeNames: t.assignees.map((a) => a.fullName).join(', ') })),
  });
}

module.exports = { dashboard };
