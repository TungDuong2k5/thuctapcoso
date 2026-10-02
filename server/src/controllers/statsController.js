const { Task, User } = require('../models');
const { getRole } = require('../services/projectAccess');
const { mondayOf } = require('../utils/http');

const WEEKS = 6;

async function projectStats(req, res) {
  const { projectId } = req.params;
  await getRole(projectId, req.user);

  const tasks = await Task.findAll({
    where: { projectId },
    include: [{ model: User, as: 'assignees', attributes: ['id'], through: { attributes: [] } }],
  });
  const members = await User.findAll({
    include: [{ association: 'projects', where: { id: projectId }, attributes: [] }],
    attributes: ['id', 'fullName'],
  });
  const today = new Date().toISOString().slice(0, 10);

  const byStatus = { todo: 0, in_progress: 0, review: 0, done: 0 };
  tasks.forEach((t) => { byStatus[t.status] += 1; });
  const done = byStatus.done;
  const overdue = tasks.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < today).length;

  const byMember = members.map((m) => {
    const mine = tasks.filter((t) => t.assignees.some((a) => a.id === m.id));
    return {
      userId: m.id,
      fullName: m.fullName,
      total: mine.length,
      done: mine.filter((t) => t.status === 'done').length,
      overdue: mine.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < today).length,
    };
  });

  // Số task hoàn thành theo từng tuần, 6 tuần gần nhất
  const thisMonday = mondayOf();
  const weekly = [];
  for (let i = WEEKS - 1; i >= 0; i -= 1) {
    const d = new Date(`${thisMonday}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7 * i);
    weekly.push({ weekStart: d.toISOString().slice(0, 10), done: 0 });
  }
  tasks.filter((t) => t.completedAt).forEach((t) => {
    const w = weekly.find((x) => x.weekStart === mondayOf(new Date(t.completedAt).toISOString()));
    if (w) w.done += 1;
  });

  res.json({
    total: tasks.length,
    done,
    completion: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
    overdue,
    byStatus,
    byMember,
    weekly,
  });
}

module.exports = { projectStats };
