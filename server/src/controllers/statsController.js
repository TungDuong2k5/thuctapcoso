const { Task, User } = require('../models');
const { requireLeader } = require('../services/projectAccess');
const { deadlineOf } = require('../utils/deadline');
const { mondayOf } = require('../utils/http');

const WEEKS = 6;

async function projectStats(req, res) {
  const { projectId } = req.params;
  // Chỉ trưởng nhóm theo dõi tiến độ của cả nhóm
  await requireLeader(projectId, req.user);

  const tasks = await Task.findAll({
    where: { projectId },
    include: [{ model: User, as: 'assignees', attributes: ['id'], through: { attributes: [] } }],
  });
  const members = await User.findAll({
    include: [{ association: 'projects', where: { id: projectId }, attributes: [], through: { attributes: ['role'] } }],
    attributes: ['id', 'fullName', 'avatarUrl'],
  });

  const byStatus = { todo: 0, in_progress: 0, review: 0, done: 0 };
  tasks.forEach((t) => { byStatus[t.status] += 1; });
  const done = byStatus.done;
  const now = new Date();
  const isOverdueNow = (t) => t.status !== 'done' && t.status !== 'review' && t.dueDate && deadlineOf(t) < now;
  const overdue = tasks.filter(isOverdueNow).length;

  // Đúng hạn / nộp muộn: so thời điểm gửi báo cáo với hạn nộp (ngày + giờ)
  const isLate = (t) => (t.submittedAt ? t.submittedLateMinutes > 0 : new Date(t.completedAt) > deadlineOf(t));
  const timeliness = (list) => {
    const finished = list.filter((t) => t.status === 'done' && t.dueDate && (t.submittedAt || t.completedAt));
    const late = finished.filter(isLate).length;
    return {
      onTime: finished.length - late,
      late,
      onTimeRate: finished.length ? Math.round(((finished.length - late) / finished.length) * 100) : null,
      lateSubmissions: list.filter((t) => t.submittedLateMinutes > 0).length,
    };
  };
  const urgentOpen = tasks.filter((t) => t.priority === 'urgent' && t.status !== 'done').length;

  const byMember = members.map((m) => {
    const mine = tasks.filter((t) => t.assignees.some((a) => a.id === m.id));
    return {
      userId: m.id,
      fullName: m.fullName,
      total: mine.length,
      done: mine.filter((t) => t.status === 'done').length,
      overdue: mine.filter(isOverdueNow).length,
      ...timeliness(mine),
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
    ...timeliness(tasks),
    doneNoDue: tasks.filter((t) => t.status === 'done' && !t.dueDate).length,
    urgentOpen,
    byStatus,
    byMember,
    weekly,
  });
}

module.exports = { projectStats };
