// Quy trình trạng thái công việc:
//   To do → In progress : người được giao bấm "Bắt đầu" (kể cả trưởng nhóm với việc của mình)
//   In progress → Review : người được giao gửi báo cáo kèm file → TỰ ĐỘNG sang Review
//   Review               : người nhận xét góp ý, rồi chọn Đạt (→ Done) hoặc Chưa đạt (→ In progress)
//                          - bài của thành viên: trưởng nhóm nhận xét
//                          - bài có trưởng nhóm cùng làm: các thành viên không tham gia nhận xét
// Một công việc có thể giao cho nhiều người: ai trong số đó cũng bắt đầu / gửi báo cáo được.
//   Done → In progress   : trưởng nhóm mở lại nếu cần
const { Op } = require('sequelize');
const {
  sequelize, Task, ActivityLog, ProjectMember,
} = require('../models');
const { notify } = require('./notify');
const { getAssigneeIds, setAssignees } = require('./assignees');
const { emitToProject } = require('../sockets');
const { HttpError } = require('../utils/http');

// Hai cột chỉ vào được bằng nút (Gửi báo cáo / Đạt), không kéo thả tay
const LOCKED = ['review', 'done'];
const WORK = ['todo', 'in_progress'];
const STATUS_LABEL = {
  todo: 'To do', in_progress: 'In progress', review: 'Review', done: 'Done',
};

const taskLink = (task) => `/projects/${task.projectId}?task=${task.id}`;

// Người làm: một trong những người được giao; việc chưa giao thì ai bắt đầu trước sẽ nhận việc
async function assertIsWorker(task, user) {
  const ids = await getAssigneeIds(task);
  if (ids.length && !ids.includes(user.id)) {
    throw new HttpError(403, 'Chỉ người được giao mới bắt đầu làm và gửi báo cáo cho công việc này');
  }
}

async function hasLeaderAssignee(task, ids) {
  if (!ids.length) return false;
  const leaders = await ProjectMember.count({ where: { projectId: task.projectId, userId: ids, role: 'leader' } });
  return leaders > 0;
}

// Ai nhận xét: bài thành viên → trưởng nhóm; bài có trưởng nhóm làm → các thành viên không tham gia
async function reviewerIds(task) {
  const ids = await getAssigneeIds(task);
  const members = await ProjectMember.findAll({ where: { projectId: task.projectId } });
  const others = members.filter((m) => !ids.includes(m.userId));
  const leaderTask = await hasLeaderAssignee(task, ids);
  return others.filter((m) => (leaderTask ? true : m.role === 'leader')).map((m) => m.userId);
}

async function canReview(task, user, role) {
  const ids = await getAssigneeIds(task);
  if (ids.includes(user.id)) return false; // không tự nhận xét bài mình làm
  if (await hasLeaderAssignee(task, ids)) return true;
  return role === 'leader';
}

async function assertCanMove(task, status, role, user) {
  if (status === task.status) return; // đổi thứ tự trong cùng cột
  if (status === 'review') throw new HttpError(400, 'Gửi báo cáo kèm file để công việc tự chuyển sang Review');
  if (status === 'done') throw new HttpError(400, 'Mở công việc và bấm "Đạt" trong phần nhận xét để chuyển sang Done');
  if (task.status === 'review') {
    throw new HttpError(400, 'Bài đang ở Review: người nhận xét bấm "Chưa đạt" để trả lại, kèm nhận xét');
  }
  if (task.status === 'done') {
    if (role !== 'leader') throw new HttpError(403, 'Chỉ trưởng nhóm được mở lại công việc đã Done');
    return;
  }
  if (WORK.includes(status)) await assertIsWorker(task, user);
}

// Đổi cột + sắp xếp lại vị trí trong cột mới, ghi lịch sử
async function changeStatus(task, status, actor, position) {
  const oldStatus = task.status;
  // Việc chưa giao: ai bấm Bắt đầu thì nhận việc
  const autoAssign = oldStatus === 'todo' && status === 'in_progress' && !(await getAssigneeIds(task)).length;
  await sequelize.transaction(async (transaction) => {
    const siblings = await Task.findAll({
      where: { projectId: task.projectId, status, id: { [Op.ne]: task.id } },
      order: [['position', 'ASC'], ['id', 'ASC']],
      transaction,
    });
    const wanted = Number.isInteger(position) ? position : siblings.length;
    const index = Math.max(0, Math.min(wanted, siblings.length));
    siblings.splice(index, 0, task);
    for (let i = 0; i < siblings.length; i += 1) {
      const t = siblings[i];
      if (t.id !== task.id && t.position !== i) await t.update({ position: i }, { transaction });
    }

    task.status = status;
    task.position = index;
    task.completedAt = status === 'done' ? (task.completedAt || new Date()) : null;
    if (status === 'done') task.progress = 100;
    // Bị trả lại / mở lại → bỏ dấu "đã nộp" để người làm gửi lại
    if (LOCKED.includes(oldStatus) && WORK.includes(status)) task.submittedAt = null;
    await task.save({ transaction });

    if (oldStatus !== status) {
      await ActivityLog.create({
        taskId: task.id, userId: actor.id, action: 'move', detail: `${STATUS_LABEL[oldStatus]} → ${STATUS_LABEL[status]}`,
      }, { transaction });
    }
  });
  if (autoAssign) await setAssignees(task, [actor.id]);
  emitToProject(task.projectId, 'task:changed', { id: task.id });
  return oldStatus;
}

// Thông báo khi kéo thả đổi cột (bắt đầu làm, trưởng nhóm mở lại)
async function notifyStatusChange(task, oldStatus, actor) {
  if (oldStatus === task.status) return;
  if (task.status === 'in_progress' && oldStatus === 'todo') {
    await notify(await reviewerIds(task), actor.id, {
      type: 'task_status', message: `${actor.fullName} đã bắt đầu làm "${task.title}"`, link: taskLink(task),
    });
  } else if (oldStatus === 'done') {
    await notify(await getAssigneeIds(task), actor.id, {
      type: 'task_status', message: `Trưởng nhóm đã mở lại "${task.title}", cần làm tiếp`, link: taskLink(task),
    });
  }
}

module.exports = {
  LOCKED,
  WORK,
  STATUS_LABEL,
  taskLink,
  assertIsWorker,
  assertCanMove,
  changeStatus,
  notifyStatusChange,
  reviewerIds,
  canReview,
};
