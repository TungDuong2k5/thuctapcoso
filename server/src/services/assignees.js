const { TaskAssignee } = require('../models');
const { assertMember } = require('./projectAccess');
const { HttpError } = require('../utils/http');

async function getAssigneeIds(task) {
  const rows = await TaskAssignee.findAll({ where: { taskId: task.id }, order: [['createdAt', 'ASC']] });
  return rows.map((r) => r.userId);
}

// Đọc danh sách người làm từ body: assigneeIds: [..] (mới) hoặc assigneeId (cũ, 1 người)
function parseAssigneeIds(body) {
  let ids;
  if (body.assigneeIds !== undefined) ids = body.assigneeIds;
  else if (body.assigneeId !== undefined) ids = body.assigneeId ? [body.assigneeId] : [];
  else return undefined;
  if (!Array.isArray(ids)) throw new HttpError(400, 'Danh sách người làm không hợp lệ');
  const clean = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (clean.length > 20) throw new HttpError(400, 'Tối đa 20 người cho một công việc');
  return clean;
}

async function validateAssignees(projectId, ids) {
  for (const id of ids) await assertMember(projectId, id);
}

// Thay toàn bộ người làm; trả về những người MỚI được thêm (để gửi thông báo)
async function setAssignees(task, ids) {
  const old = await getAssigneeIds(task);
  await TaskAssignee.destroy({ where: { taskId: task.id } });
  for (const userId of ids) await TaskAssignee.create({ taskId: task.id, userId });
  task.assigneeId = ids[0] || null;
  await task.save();
  return ids.filter((id) => !old.includes(id));
}

module.exports = {
  getAssigneeIds, parseAssigneeIds, validateAssignees, setAssignees,
};
