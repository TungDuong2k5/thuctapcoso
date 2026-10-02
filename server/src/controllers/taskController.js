const { Op } = require('sequelize');
const {
  sequelize, Task, User, Comment, ActivityLog, Attachment, TaskReview, TASK_STATUSES, PRIORITIES,
} = require('../models');
const {
  getAssigneeIds, parseAssigneeIds, validateAssignees, setAssignees,
} = require('../services/assignees');
const { removeStoredFile } = require('../middlewares/upload');
const {
  assertCanMove, changeStatus, notifyStatusChange, taskLink, canReview,
} = require('../services/taskFlow');
const { getRole } = require('../services/projectAccess');
const { notify } = require('../services/notify');
const { emitToProject } = require('../sockets');
const { HttpError } = require('../utils/http');

const userAttrs = ['id', 'fullName', 'email'];
// Danh sách người làm kèm theo mỗi công việc (bỏ cột của bảng trung gian)
const assigneesInclude = { model: User, as: 'assignees', attributes: userAttrs, through: { attributes: [] } };

async function loadTask(id) {
  const task = await Task.findByPk(id);
  if (!task) throw new HttpError(404, 'Không tìm thấy công việc');
  return task;
}


async function list(req, res) {
  await getRole(req.params.projectId, req.user);
  const where = { projectId: req.params.projectId };
  if (req.query.status) where.status = req.query.status;
  if (req.query.assigneeId === 'none') {
    where.id = { [Op.notIn]: sequelize.literal('(SELECT task_id FROM task_assignees)') };
  } else if (req.query.assigneeId) {
    const uid = Number(req.query.assigneeId) || 0;
    where.id = { [Op.in]: sequelize.literal(`(SELECT task_id FROM task_assignees WHERE user_id = ${uid})`) };
  }
  if (req.query.q) where.title = { [Op.like]: `%${req.query.q}%` };

  const tasks = await Task.findAll({
    where,
    include: [
      assigneesInclude,
      { model: Attachment, as: 'attachments', attributes: ['id'] },
    ],
    order: [['status', 'ASC'], ['position', 'ASC'], ['id', 'ASC']],
  });
  res.json(tasks);
}

async function create(req, res) {
  const { projectId } = req.params;
  await getRole(projectId, req.user);
  const {
    title, description, priority = 'medium', dueDate,
  } = req.body;
  if (!title?.trim()) throw new HttpError(400, 'Vui lòng nhập tiêu đề công việc');
  if (!PRIORITIES.includes(priority)) throw new HttpError(400, 'Độ ưu tiên không hợp lệ');
  const assigneeIds = parseAssigneeIds(req.body) || [];
  await validateAssignees(projectId, assigneeIds);

  const position = await Task.count({ where: { projectId, status: 'todo' } });
  const task = await Task.create({
    projectId,
    title: title.trim(),
    description,
    priority,
    dueDate: dueDate || null,
    creatorId: req.user.id,
    position,
  });
  await setAssignees(task, assigneeIds);
  await ActivityLog.create({ taskId: task.id, userId: req.user.id, action: 'create', detail: 'Tạo công việc' });

  emitToProject(projectId, 'task:changed', { id: task.id });
  await notify(assigneeIds, req.user.id, {
    type: 'task_assigned',
    message: assigneeIds.length > 1
      ? `${req.user.fullName} đã giao cho bạn (cùng ${assigneeIds.length - 1} người khác): "${task.title}"`
      : `${req.user.fullName} đã giao cho bạn: "${task.title}"`,
    link: taskLink(task),
  });
  res.status(201).json(task);
}

async function detail(req, res) {
  const task = await loadTask(req.params.id);
  await getRole(task.projectId, req.user);
  const full = await Task.findByPk(task.id, {
    include: [
      assigneesInclude,
      { model: User, as: 'creator', attributes: userAttrs },
      { model: Comment, as: 'comments', include: [{ model: User, as: 'author', attributes: userAttrs }] },
      { model: Attachment, as: 'attachments', include: [{ model: User, as: 'uploader', attributes: userAttrs }] },
      { model: TaskReview, as: 'reviews', include: [{ model: User, as: 'reviewer', attributes: userAttrs }] },
      { model: ActivityLog, as: 'logs', include: [{ model: User, as: 'actor', attributes: userAttrs }] },
    ],
    order: [
      [{ model: Comment, as: 'comments' }, 'id', 'ASC'],
      [{ model: Attachment, as: 'attachments' }, 'id', 'DESC'],
      [{ model: TaskReview, as: 'reviews' }, 'id', 'DESC'],
      [{ model: ActivityLog, as: 'logs' }, 'id', 'DESC'],
    ],
  });
  res.json(full);
}

async function update(req, res) {
  const task = await loadTask(req.params.id);
  await getRole(task.projectId, req.user);
  const {
    title, description, priority, dueDate, progress,
  } = req.body;
  const assigneeIds = parseAssigneeIds(req.body);

  if (progress !== undefined && (!Number.isInteger(progress) || progress < 0 || progress > 100)) {
    throw new HttpError(400, 'Tiến độ phải là số nguyên từ 0 đến 100');
  }
  if (title !== undefined && !title.trim()) throw new HttpError(400, 'Tiêu đề không được để trống');
  if (priority !== undefined && !PRIORITIES.includes(priority)) throw new HttpError(400, 'Độ ưu tiên không hợp lệ');
  if (assigneeIds !== undefined) await validateAssignees(task.projectId, assigneeIds);

  const oldProgress = task.progress;
  if (title !== undefined) task.title = title.trim();
  if (description !== undefined) task.description = description;
  if (priority !== undefined) task.priority = priority;
  if (dueDate !== undefined && (dueDate || null) !== task.dueDate) {
    task.dueDate = dueDate || null;
    task.remindedSoonFor = null; // đổi hạn → nhắc lại theo hạn mới
    task.overdueRemindedOn = null;
  }
  if (progress !== undefined) task.progress = progress;
  await task.save();
  const added = assigneeIds !== undefined ? await setAssignees(task, assigneeIds) : [];
  const detail = progress !== undefined && progress !== oldProgress
    ? `Cập nhật tiến độ ${oldProgress}% → ${progress}%`
    : 'Cập nhật thông tin';
  await ActivityLog.create({ taskId: task.id, userId: req.user.id, action: 'update', detail });

  emitToProject(task.projectId, 'task:changed', { id: task.id });
  if (added.length) {
    await notify(added, req.user.id, {
      type: 'task_assigned',
      message: `${req.user.fullName} đã giao cho bạn: "${task.title}"`,
      link: taskLink(task),
    });
  }
  res.json(task);
}

// Kéo-thả trên bảng Kanban: đổi cột (status) và vị trí trong cột
async function move(req, res) {
  const task = await loadTask(req.params.id);
  const role = await getRole(task.projectId, req.user);
  const { status } = req.body;
  if (!TASK_STATUSES.includes(status)) throw new HttpError(400, 'Trạng thái không hợp lệ');
  await assertCanMove(task, status, role, req.user);

  const oldStatus = await changeStatus(task, status, req.user, req.body.position);
  await notifyStatusChange(task, oldStatus, req.user, role);
  res.json(task);
}

// Nhận xét bài ở cột Review:
//   comment → chỉ góp ý (vẫn ở Review)
//   approve → Đạt, sang Done
//   reject  → Chưa đạt, trả về In progress (bắt buộc ghi phần cần bổ sung)
// Bài của thành viên do trưởng nhóm nhận xét; bài của trưởng nhóm do các thành viên khác nhận xét.
async function review(req, res) {
  const task = await loadTask(req.params.id);
  const role = await getRole(task.projectId, req.user);
  if (task.status !== 'review') throw new HttpError(400, 'Chỉ nhận xét được bài đang ở Review');
  if (!(await canReview(task, req.user, role))) {
    throw new HttpError(403, (await getAssigneeIds(task)).includes(req.user.id)
      ? 'Bạn không thể tự nhận xét bài của mình'
      : 'Bài của thành viên do trưởng nhóm nhận xét');
  }

  const { decision } = req.body;
  const target = { comment: 'review', approve: 'done', reject: 'in_progress' }[decision];
  if (!target) throw new HttpError(400, 'Quyết định không hợp lệ');
  const goodPoints = req.body.goodPoints?.trim() || null;
  const improvements = (req.body.improvements ?? req.body.note)?.trim() || null;
  if (decision === 'reject' && !improvements) {
    throw new HttpError(400, 'Hãy ghi phần cần bổ sung/hoàn thiện để người làm biết cần sửa gì');
  }
  if (decision === 'comment' && !goodPoints && !improvements) {
    throw new HttpError(400, 'Hãy viết nhận xét trước khi gửi');
  }

  await TaskReview.create({
    taskId: task.id, reviewerId: req.user.id, decision, goodPoints, improvements,
  });
  if (target !== task.status) await changeStatus(task, target, req.user);
  emitToProject(task.projectId, 'task:changed', { id: task.id });

  const parts = [];
  if (goodPoints) parts.push(`Ổn: ${goodPoints}`);
  if (improvements) parts.push(`Cần bổ sung: ${improvements}`);
  const detail = parts.length ? ` — ${parts.join(' | ')}` : '';
  const message = {
    comment: `${req.user.fullName} đã nhận xét bài "${task.title}"${detail}`,
    approve: `Bài "${task.title}" đã ĐẠT, chuyển sang Done${detail}`,
    reject: `Bài "${task.title}" chưa đạt, cần bổ sung/hoàn thiện${detail}`,
  }[decision];
  await notify(await getAssigneeIds(task), req.user.id, { type: 'task_review', message, link: taskLink(task) });
  res.json(task);
}

async function remove(req, res) {
  const task = await loadTask(req.params.id);
  const role = await getRole(task.projectId, req.user);
  if (role !== 'leader' && task.creatorId !== req.user.id) {
    throw new HttpError(403, 'Chỉ trưởng nhóm hoặc người tạo được xóa công việc');
  }
  const files = await Attachment.findAll({ where: { taskId: task.id } });
  await task.destroy();
  files.forEach((f) => removeStoredFile(f.storedName));
  emitToProject(task.projectId, 'task:changed', { id: task.id });
  res.json({ success: true });
}

async function addComment(req, res) {
  const task = await loadTask(req.params.id);
  await getRole(task.projectId, req.user);
  if (!req.body.content?.trim()) throw new HttpError(400, 'Nội dung bình luận trống');

  const comment = await Comment.create({ taskId: task.id, userId: req.user.id, content: req.body.content.trim() });
  const full = await Comment.findByPk(comment.id, { include: [{ model: User, as: 'author', attributes: userAttrs }] });

  emitToProject(task.projectId, 'comment:new', { taskId: task.id });
  await notify([...(await getAssigneeIds(task)), task.creatorId], req.user.id, {
    type: 'comment',
    message: `${req.user.fullName} bình luận trong "${task.title}"`,
    link: taskLink(task),
  });
  res.status(201).json(full);
}

module.exports = {
  list, create, detail, update, move, review, remove, addComment,
};
