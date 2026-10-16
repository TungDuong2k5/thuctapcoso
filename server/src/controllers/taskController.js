const { Op } = require('sequelize');
const {
  sequelize, Task, User, Comment, ActivityLog, Attachment, TaskReview, Label, TaskLabel,
  ProjectMember, TASK_STATUSES, TASK_PRIORITIES,
} = require('../models');
const { assertCanSeeTask, memberTaskFilter } = require('../services/visibility');
const { unreadByTask } = require('./dmController');
const { TIME_RE } = require('../utils/deadline');
const {
  getAssigneeIds, parseAssigneeIds, validateAssignees, setAssignees,
} = require('../services/assignees');
const { removeStoredFile } = require('../middlewares/upload');
const {
  assertCanMove, changeStatus, notifyStatusChange, taskLink, canReview,
} = require('../services/taskFlow');
const { getRole, assertCanEdit } = require('../services/projectAccess');
const { notify } = require('../services/notify');
const { emitToProject } = require('../sockets');
const { HttpError } = require('../utils/http');

const userAttrs = ['id', 'fullName', 'email', 'avatarUrl'];
// Danh sách người làm kèm theo mỗi công việc (bỏ cột của bảng trung gian)
const assigneesInclude = { model: User, as: 'assignees', attributes: userAttrs, through: { attributes: [] } };
const labelsInclude = { model: Label, as: 'labels', attributes: ['id', 'name', 'color'], through: { attributes: [] } };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function checkDates(startDate, dueDate, dueTime) {
  for (const d of [startDate, dueDate]) {
    if (d && !DATE_RE.test(d)) throw new HttpError(400, 'Ngày không hợp lệ');
  }
  if (startDate && dueDate && startDate > dueDate) throw new HttpError(400, 'Ngày bắt đầu phải trước hạn nộp');
  if (dueTime && !TIME_RE.test(dueTime)) throw new HttpError(400, 'Giờ hết hạn không hợp lệ (VD 17:00)');
  if (dueTime && !dueDate) throw new HttpError(400, 'Chọn ngày hết hạn trước khi đặt giờ');
}

function checkPriority(priority) {
  if (!TASK_PRIORITIES.includes(priority)) throw new HttpError(400, 'Mức ưu tiên chỉ có Thường hoặc Khẩn cấp');
}

// Đọc labelIds từ body và kiểm tra nhãn thuộc đúng dự án
async function parseLabelIds(projectId, body) {
  if (body.labelIds === undefined) return undefined;
  if (!Array.isArray(body.labelIds)) throw new HttpError(400, 'Danh sách nhãn không hợp lệ');
  const ids = [...new Set(body.labelIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length && await Label.count({ where: { id: ids, projectId } }) !== ids.length) {
    throw new HttpError(400, 'Nhãn không thuộc dự án này');
  }
  return ids;
}

async function setLabels(task, ids) {
  await TaskLabel.destroy({ where: { taskId: task.id } });
  if (ids.length) await TaskLabel.bulkCreate(ids.map((labelId) => ({ taskId: task.id, labelId })));
}

// Tải công việc và kiểm tra người dùng được xem (thành viên chỉ xem việc của mình)
async function loadTask(id, user) {
  const task = await Task.findByPk(id);
  if (!task) throw new HttpError(404, 'Không tìm thấy công việc');
  await assertCanSeeTask(task, user);
  return task;
}


async function list(req, res) {
  const role = await getRole(req.params.projectId, req.user);
  const where = { projectId: req.params.projectId };
  if (req.query.status) where.status = req.query.status;
  if (req.query.priority) where.priority = req.query.priority;
  const idConds = [];
  if (role === 'member') idConds.push(memberTaskFilter(req.params.projectId, req.user.id));
  if (req.query.assigneeId === 'none') {
    idConds.push({ id: { [Op.notIn]: sequelize.literal('(SELECT task_id FROM task_assignees)') } });
  } else if (req.query.assigneeId) {
    const uid = Number(req.query.assigneeId) || 0;
    idConds.push({ id: { [Op.in]: sequelize.literal(`(SELECT task_id FROM task_assignees WHERE user_id = ${uid})`) } });
  }
  if (req.query.labelId) {
    const lid = Number(req.query.labelId) || 0;
    idConds.push({ id: { [Op.in]: sequelize.literal(`(SELECT task_id FROM task_labels WHERE label_id = ${lid})`) } });
  }
  if (idConds.length) where[Op.and] = idConds;
  if (req.query.q) where.title = { [Op.like]: `%${req.query.q}%` };

  const tasks = await Task.findAll({
    where,
    include: [
      assigneesInclude,
      labelsInclude,
      { model: Attachment, as: 'attachments', attributes: ['id'] },
    ],
    order: [['status', 'ASC'], ['position', 'ASC'], ['id', 'ASC']],
  });
  const unread = await unreadByTask(req.user.id, tasks.map((x) => x.id));
  res.json(tasks.map((x) => ({ ...x.toJSON(), dmUnread: unread[x.id] || 0 })));
}

async function create(req, res) {
  const { projectId } = req.params;
  assertCanEdit(await getRole(projectId, req.user));
  const {
    title, description, priority = 'medium', dueDate, startDate, dueTime,
  } = req.body;
  if (!title?.trim()) throw new HttpError(400, 'Vui lòng nhập tiêu đề công việc');
  checkPriority(priority);
  checkDates(startDate, dueDate, dueTime);
  const assigneeIds = parseAssigneeIds(req.body) || [];
  await validateAssignees(projectId, assigneeIds);
  const labelIds = await parseLabelIds(projectId, req.body) || [];

  const position = await Task.count({ where: { projectId, status: 'todo' } });
  const task = await Task.create({
    projectId,
    title: title.trim(),
    description,
    priority,
    startDate: startDate || null,
    dueDate: dueDate || null,
    dueTime: dueTime || null,
    creatorId: req.user.id,
    position,
  });
  await setAssignees(task, assigneeIds);
  await setLabels(task, labelIds);
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
  const task = await loadTask(req.params.id, req.user);
  const full = await Task.findByPk(task.id, {
    include: [
      assigneesInclude,
      labelsInclude,
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
  const task = await loadTask(req.params.id, req.user);
  assertCanEdit(await getRole(task.projectId, req.user));
  const {
    title, description, priority, dueDate, startDate, dueTime, progress,
  } = req.body;
  const assigneeIds = parseAssigneeIds(req.body);
  const labelIds = await parseLabelIds(task.projectId, req.body);
  checkDates(
    startDate !== undefined ? startDate : task.startDate,
    dueDate !== undefined ? dueDate : task.dueDate,
    dueTime !== undefined ? dueTime : (dueDate === '' ? null : task.dueTime),
  );

  if (progress !== undefined && (!Number.isInteger(progress) || progress < 0 || progress > 100)) {
    throw new HttpError(400, 'Tiến độ phải là số nguyên từ 0 đến 100');
  }
  if (progress !== undefined && progress !== task.progress) {
    const ids = await getAssigneeIds(task);
    const role = await getRole(task.projectId, req.user);
    if (ids.length && !ids.includes(req.user.id) && role !== 'leader') {
      throw new HttpError(403, 'Chỉ người được giao mới cập nhật mức hoàn thành của công việc');
    }
  }
  if (title !== undefined && !title.trim()) throw new HttpError(400, 'Tiêu đề không được để trống');
  if (priority !== undefined) checkPriority(priority);
  if (assigneeIds !== undefined) await validateAssignees(task.projectId, assigneeIds);

  const oldProgress = task.progress;
  if (title !== undefined) task.title = title.trim();
  if (description !== undefined) task.description = description;
  if (priority !== undefined) task.priority = priority;
  const newDueTime = dueTime !== undefined ? (dueTime || null) : (dueDate === '' ? null : task.dueTime);
  if ((dueDate !== undefined && (dueDate || null) !== task.dueDate) || newDueTime !== task.dueTime) {
    if (dueDate !== undefined) task.dueDate = dueDate || null;
    task.dueTime = newDueTime;
    task.remindedSoonFor = null; // đổi hạn → nhắc lại theo hạn mới
    task.overdueRemindedOn = null;
    task.dueTodayRemindedFor = null;
    task.lastUrgentAt = null;
  }
  if (startDate !== undefined) task.startDate = startDate || null;
  if (progress !== undefined) task.progress = progress;
  await task.save();
  const added = assigneeIds !== undefined ? await setAssignees(task, assigneeIds) : [];
  if (labelIds !== undefined) await setLabels(task, labelIds);
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
  const task = await loadTask(req.params.id, req.user);
  const role = await getRole(task.projectId, req.user);
  assertCanEdit(role);
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
  const task = await loadTask(req.params.id, req.user);
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
  const task = await loadTask(req.params.id, req.user);
  const role = await getRole(task.projectId, req.user);
  assertCanEdit(role);
  if (role !== 'leader' && task.creatorId !== req.user.id) {
    throw new HttpError(403, 'Chỉ trưởng nhóm hoặc người tạo được xóa công việc');
  }
  const files = await Attachment.findAll({ where: { taskId: task.id } });
  await TaskLabel.destroy({ where: { taskId: task.id } });
  await task.destroy();
  files.forEach((f) => removeStoredFile(f.storedName));
  emitToProject(task.projectId, 'task:changed', { id: task.id });
  res.json({ success: true });
}

async function addComment(req, res) {
  const task = await loadTask(req.params.id, req.user);
  assertCanEdit(await getRole(task.projectId, req.user));
  if (!req.body.content?.trim()) throw new HttpError(400, 'Nội dung bình luận trống');
  if (req.body.content.length > 2000) throw new HttpError(400, 'Bình luận tối đa 2000 ký tự');

  const comment = await Comment.create({ taskId: task.id, userId: req.user.id, content: req.body.content.trim() });
  const full = await Comment.findByPk(comment.id, { include: [{ model: User, as: 'author', attributes: userAttrs }] });

  emitToProject(task.projectId, 'comment:new', { taskId: task.id });
  // @nhắc tên: chỉ nhận người thuộc dự án
  const wanted = Array.isArray(req.body.mentionIds)
    ? [...new Set(req.body.mentionIds.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n !== req.user.id))]
    : [];
  const mentioned = wanted.length
    ? (await ProjectMember.findAll({ where: { projectId: task.projectId, userId: wanted } })).map((m) => m.userId)
    : [];
  if (mentioned.length) {
    await notify(mentioned, req.user.id, {
      type: 'mention',
      message: `${req.user.fullName} đã nhắc đến bạn trong "${task.title}": ${comment.content}`,
      link: taskLink(task),
    });
  }
  const others = [...(await getAssigneeIds(task)), task.creatorId].filter((id) => !mentioned.includes(id));
  await notify(others, req.user.id, {
    type: 'comment',
    message: `${req.user.fullName} bình luận trong "${task.title}"`,
    link: taskLink(task),
  });
  res.status(201).json(full);
}

module.exports = {
  list, create, detail, update, move, review, remove, addComment,
};
