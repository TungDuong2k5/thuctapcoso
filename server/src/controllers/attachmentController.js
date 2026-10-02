const fs = require('fs');
const path = require('path');
const {
  Task, Attachment, ActivityLog, Comment,
} = require('../models');
const { getRole } = require('../services/projectAccess');
const { notify } = require('../services/notify');
const { emitToProject } = require('../sockets');
const { removeStoredFile, UPLOAD_DIR } = require('../middlewares/upload');
const { HttpError } = require('../utils/http');
const { getAssigneeIds, setAssignees } = require('../services/assignees');
const {
  changeStatus, taskLink, assertIsWorker, reviewerIds,
} = require('../services/taskFlow');

// Chạy TRƯỚC multer: kiểm tra quyền rồi mới nhận file, người ngoài dự án không upload được
async function checkTaskAccess(req, res, next) {
  const task = await Task.findByPk(req.params.id);
  if (!task) throw new HttpError(404, 'Không tìm thấy công việc');
  req.role = await getRole(task.projectId, req.user);
  req.task = task;
  next();
}

async function saveFiles(req, note) {
  if (!req.files?.length) throw new HttpError(400, 'Vui lòng chọn ít nhất một file');
  const rows = await Attachment.bulkCreate(req.files.map((f) => ({
    taskId: req.task.id,
    uploaderId: req.user.id,
    originalName: f.originalname,
    storedName: f.filename,
    mimeType: f.mimetype,
    size: f.size,
    note: note?.slice(0, 500) || null,
  })));
  await ActivityLog.create({
    taskId: req.task.id,
    userId: req.user.id,
    action: 'upload',
    detail: `Tải lên ${rows.length} file: ${rows.map((r) => r.originalName).join(', ')}`.slice(0, 255),
  });
  return rows;
}

// Xóa file vừa nhận nếu xử lý lỗi, tránh rác trong thư mục uploads
function cleanupOnError(req) {
  (req.files || []).forEach((f) => removeStoredFile(f.filename));
}

async function upload(req, res) {
  try {
    const rows = await saveFiles(req, req.body.note);
    emitToProject(req.task.projectId, 'task:changed', { id: req.task.id });
    res.status(201).json(rows);
  } catch (err) {
    cleanupOnError(req);
    throw err;
  }
}

// "Gửi báo cáo": bắt buộc có file. Gửi xong công việc TỰ ĐỘNG sang Review
// và báo người nhận xét (trưởng nhóm, hoặc các thành viên nếu là bài của trưởng nhóm).
async function submit(req, res) {
  const { task } = req;
  try {
    if (!['todo', 'in_progress'].includes(task.status)) {
      throw new HttpError(400, task.status === 'review'
        ? 'Bài đang chờ nhận xét, chờ kết quả trước khi gửi lại'
        : 'Công việc đã hoàn thành, không cần gửi lại');
    }
    await assertIsWorker(task, req.user);

    const rows = await saveFiles(req, req.body.note);
    const note = req.body.note?.trim();
    await Comment.create({
      taskId: task.id,
      userId: req.user.id,
      content: `Đã gửi báo cáo (${rows.length} file: ${rows.map((r) => r.originalName).join(', ')})${note ? `
${note}` : ''}`,
    });
    emitToProject(task.projectId, 'comment:new', { taskId: task.id });

    if (!(await getAssigneeIds(task)).length) await setAssignees(task, [req.user.id]);
    task.submittedAt = new Date();
    await changeStatus(task, 'review', req.user); // tự động sang Review (lưu luôn submittedAt)

    await notify(await reviewerIds(task), req.user.id, {
      type: 'task_submitted',
      message: `${req.user.fullName} đã gửi báo cáo "${task.title}" (${rows.length} file), mời bạn nhận xét`,
      link: taskLink(task),
    });
    res.status(201).json({ task, attachments: rows });
  } catch (err) {
    cleanupOnError(req);
    throw err;
  }
}

async function loadAttachment(id, user) {
  const att = await Attachment.findByPk(id, { include: [{ model: Task, attributes: ['id', 'projectId', 'title'] }] });
  if (!att) throw new HttpError(404, 'Không tìm thấy file');
  const role = await getRole(att.Task.projectId, user);
  return { att, role };
}

async function download(req, res) {
  const { att } = await loadAttachment(req.params.id, req.user);
  const filePath = path.join(UPLOAD_DIR, att.storedName);
  if (!fs.existsSync(filePath)) throw new HttpError(404, 'File không còn trên máy chủ');
  res.download(filePath, att.originalName);
}

async function remove(req, res) {
  const { att, role } = await loadAttachment(req.params.id, req.user);
  if (att.uploaderId !== req.user.id && role !== 'leader') {
    throw new HttpError(403, 'Chỉ người tải lên hoặc trưởng nhóm được xóa file');
  }
  await att.destroy();
  removeStoredFile(att.storedName);
  await ActivityLog.create({ taskId: att.taskId, userId: req.user.id, action: 'delete_file', detail: `Xóa file ${att.originalName}`.slice(0, 255) });
  emitToProject(att.Task.projectId, 'task:changed', { id: att.taskId });
  res.json({ success: true });
}

module.exports = {
  checkTaskAccess, upload, submit, download, remove,
};
