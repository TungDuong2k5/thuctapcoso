const { Op } = require('sequelize');
const {
  sequelize, WeeklyReport, Task, User, Project,
} = require('../models');
const { getRole, requireLeader, leaderIds } = require('../services/projectAccess');
const { notify } = require('../services/notify');
const { HttpError, mondayOf } = require('../utils/http');

const userAttrs = ['id', 'fullName', 'email'];

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function loadReport(id) {
  const report = await WeeklyReport.findByPk(id);
  if (!report) throw new HttpError(404, 'Không tìm thấy báo cáo');
  return report;
}

// Trưởng nhóm xem báo cáo của cả nhóm; thành viên chỉ xem báo cáo của mình
async function list(req, res) {
  const { projectId } = req.params;
  const role = await getRole(projectId, req.user);
  const where = { projectId };
  if (req.query.week) where.weekStart = mondayOf(req.query.week);
  if (role !== 'leader') where.userId = req.user.id;

  const reports = await WeeklyReport.findAll({
    where,
    include: [
      { model: User, as: 'author', attributes: userAttrs },
      { model: User, as: 'reviewer', attributes: userAttrs },
    ],
    order: [['weekStart', 'DESC'], ['userId', 'ASC']],
  });
  res.json(reports);
}

// Gợi ý nội dung "Đã làm" từ các task của mình hoàn thành trong tuần
async function suggest(req, res) {
  const { projectId } = req.params;
  await getRole(projectId, req.user);
  const weekStart = mondayOf(req.query.week);
  const tasks = await Task.findAll({
    where: {
      projectId,
      id: { [Op.in]: sequelize.literal(`(SELECT task_id FROM task_assignees WHERE user_id = ${Number(req.user.id)})`) },
      status: 'done',
      completedAt: { [Op.gte]: new Date(`${weekStart}T00:00:00`), [Op.lt]: new Date(`${addDays(weekStart, 7)}T00:00:00`) },
    },
    order: [['completedAt', 'ASC']],
  });
  const inProgress = await Task.findAll({
    where: {
      projectId,
      status: { [Op.in]: ['todo', 'in_progress', 'review'] },
      id: { [Op.in]: sequelize.literal(`(SELECT task_id FROM task_assignees WHERE user_id = ${Number(req.user.id)})`) },
    },
    order: [['dueDate', 'ASC']],
  });
  res.json({
    weekStart,
    doneText: tasks.map((t) => `- ${t.title}`).join('\n'),
    planText: inProgress.map((t) => `- ${t.title}${t.dueDate ? ` (hạn ${t.dueDate})` : ''}`).join('\n'),
  });
}

// Tạo mới hoặc ghi đè bản nháp của tuần (mỗi người 1 báo cáo / tuần / dự án)
async function save(req, res) {
  const { projectId } = req.params;
  await getRole(projectId, req.user);
  const weekStart = mondayOf(req.body.weekStart);
  const {
    doneText, planText, issuesText, submit,
  } = req.body;

  let report = await WeeklyReport.findOne({ where: { projectId, userId: req.user.id, weekStart } });
  if (report && report.status !== 'draft') throw new HttpError(400, 'Báo cáo đã nộp, không thể sửa');
  if (submit && !doneText?.trim()) throw new HttpError(400, 'Cần điền phần "Đã làm" trước khi nộp');

  const values = {
    doneText, planText, issuesText, status: submit ? 'submitted' : 'draft',
  };
  if (report) await report.update(values);
  else report = await WeeklyReport.create({ projectId, userId: req.user.id, weekStart, ...values });

  if (submit) {
    const project = await Project.findByPk(projectId);
    await notify(await leaderIds(projectId), req.user.id, {
      type: 'report_submitted',
      message: `${req.user.fullName} đã nộp báo cáo tuần ${weekStart} (${project.name})`,
      link: `/projects/${projectId}/reports?week=${weekStart}`,
    });
  }
  res.json(report);
}

// Trưởng nhóm nhận xét, chấm điểm hoặc trả lại báo cáo
async function review(req, res) {
  const report = await loadReport(req.params.id);
  await requireLeader(report.projectId, req.user);
  if (report.status === 'draft') throw new HttpError(400, 'Báo cáo chưa được nộp');
  const { feedback, score, returnToDraft } = req.body;
  if (score !== undefined && score !== null && (score < 0 || score > 10)) throw new HttpError(400, 'Điểm từ 0 đến 10');

  await report.update({
    feedback,
    score: score ?? null,
    status: returnToDraft ? 'draft' : 'reviewed',
    reviewedBy: req.user.id,
  });
  await notify(report.userId, req.user.id, {
    type: 'report_reviewed',
    message: returnToDraft
      ? `Báo cáo tuần ${report.weekStart} bị trả lại, vui lòng chỉnh sửa`
      : `Báo cáo tuần ${report.weekStart} đã được nhận xét`,
    link: `/projects/${report.projectId}/reports?week=${report.weekStart}`,
  });
  res.json(report);
}

module.exports = {
  list, suggest, save, review,
};
