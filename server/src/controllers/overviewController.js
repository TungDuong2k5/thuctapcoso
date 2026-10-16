const { Op } = require('sequelize');
const {
  Project, ProjectMember, Task, User,
} = require('../models');
const { personStats, addStats, assignedTo } = require('../services/progress');
const { mondayOf } = require('../utils/http');

const DAYS = 14;
const WEEKS = 8;
const MONTHS = 6;
const TZ = 'Asia/Ho_Chi_Minh';
// Ngày theo giờ Việt Nam dạng YYYY-MM-DD
const vnDay = (d) => new Date(d).toLocaleDateString('sv-SE', { timeZone: TZ });
function shiftDay(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Tiến độ hàng ngày / hàng tuần: số việc hoàn thành (Done) và số bài nộp theo ngày, theo tuần
function timeline(tasks, now = new Date()) {
  const today = vnDay(now);
  const daily = [];
  for (let i = DAYS - 1; i >= 0; i -= 1) daily.push({ date: shiftDay(today, -i), done: 0, submitted: 0 });
  const thisMonday = mondayOf(today);
  const weekly = [];
  for (let i = WEEKS - 1; i >= 0; i -= 1) weekly.push({ weekStart: shiftDay(thisMonday, -7 * i), done: 0, submitted: 0 });
  const monthly = [];
  const [y, m] = today.split('-').map(Number);
  for (let i = MONTHS - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    monthly.push({ month: d.toISOString().slice(0, 7), done: 0, submitted: 0 });
  }
  const add = (when, key) => {
    if (!when) return;
    const day = vnDay(when);
    const mo = monthly.find((x) => x.month === day.slice(0, 7));
    if (mo) mo[key] += 1;
    const d = daily.find((x) => x.date === day);
    if (d) d[key] += 1;
    const w = weekly.find((x) => x.weekStart === mondayOf(day));
    if (w) w[key] += 1;
  };
  for (const t of tasks) {
    if (t.status === 'done') add(t.completedAt, 'done');
    add(t.submittedAt, 'submitted');
  }
  return { daily, weekly, monthly };
}

// Tổng quan tiến độ trên TẤT CẢ dự án đang tham gia:
// - dự án mình là trưởng nhóm: thấy tiến độ của mọi thành viên (kể cả mình)
// - dự án mình là thành viên: chỉ tính tiến độ của chính mình
async function overview(req, res) {
  const mine = await ProjectMember.findAll({ where: { userId: req.user.id } });
  const roleOf = Object.fromEntries(mine.map((m) => [m.projectId, m.role]));
  const projectRows = mine.length ? await Project.findAll({
    where: { id: Object.keys(roleOf).map(Number), status: 'active' },
    attributes: ['id', 'name', 'endDate'],
    order: [['id', 'DESC']],
  }) : [];
  if (!projectRows.length) {
    return res.json({
      projects: [], people: [], leaderOf: 0, ...timeline([]),
    });
  }

  const ids = projectRows.map((p) => p.id);
  const tasks = await Task.findAll({
    where: { projectId: ids },
    attributes: ['id', 'projectId', 'status', 'progress', 'dueDate', 'dueTime', 'submittedLateMinutes', 'completedAt', 'submittedAt'],
    include: [{ model: User, as: 'assignees', attributes: ['id'], through: { attributes: [] } }],
  });
  const members = await ProjectMember.findAll({ where: { projectId: ids, role: { [Op.ne]: 'guest' } } });
  const users = await User.findAll({
    where: { id: [...new Set(members.map((m) => m.userId))] },
    attributes: ['id', 'fullName', 'avatarUrl', 'email'],
  });
  const userById = Object.fromEntries(users.map((u) => [u.id, u]));

  const projects = [];
  const people = new Map();
  const scopedTasks = new Map(); // các công việc được tính vào tiến độ hàng ngày / hàng tuần
  const today = vnDay(new Date());
  const thisMonday = mondayOf(today);
  for (const p of projectRows) {
    const pTasks = tasks.filter((t) => t.projectId === p.id);
    const myRole = roleOf[p.id];
    projects.push({
      id: p.id, name: p.name, endDate: p.endDate, myRole, progress: personStats(pTasks),
    });
    // Ai được tính ở dự án này
    const scope = myRole === 'leader'
      ? members.filter((m) => m.projectId === p.id)
      : members.filter((m) => m.projectId === p.id && m.userId === req.user.id);
    for (const m of scope) {
      const u = userById[m.userId];
      if (!u) continue;
      const theirs = assignedTo(pTasks, m.userId);
      theirs.forEach((t) => scopedTasks.set(t.id, t));
      const stats = personStats(theirs);
      stats.doneToday = theirs.filter((t) => t.status === 'done' && t.completedAt && vnDay(t.completedAt) === today).length;
      stats.doneThisWeek = theirs.filter((t) => t.status === 'done' && t.completedAt && vnDay(t.completedAt) >= thisMonday).length;
      const entry = people.get(m.userId) || {
        userId: u.id,
        fullName: u.fullName,
        avatarUrl: u.avatarUrl,
        email: u.email,
        isMe: u.id === req.user.id,
        total: 0,
        doneToday: 0,
        doneThisWeek: 0,
        projects: [],
      };
      entry.doneToday += stats.doneToday;
      entry.doneThisWeek += stats.doneThisWeek;
      Object.assign(entry, addStats(entry, stats));
      entry.projects.push({
        projectId: p.id, name: p.name, role: m.role, ...stats,
      });
      people.set(m.userId, entry);
    }
  }

  res.json({
    projects,
    people: [...people.values()].sort((a, b) => (b.isMe - a.isMe) || a.fullName.localeCompare(b.fullName, 'vi')),
    leaderOf: projects.filter((p) => p.myRole === 'leader').length,
    ...timeline([...scopedTasks.values()]),
  });
}

module.exports = { overview };
