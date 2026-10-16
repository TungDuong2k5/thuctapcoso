// Quyền xem công việc:
//  - Trưởng nhóm (và khách chỉ xem) thấy toàn bộ công việc, theo dõi được tiến độ cả nhóm
//  - Thành viên chỉ thấy việc của mình: việc được giao cho mình, việc mình tạo, việc chưa giao ai
//    (để nhận làm) và bài của trưởng nhóm đang chờ mình nhận xét
const { Op } = require('sequelize');
const { sequelize } = require('../models');
const { getRole } = require('./projectAccess');
const { getAssigneeIds } = require('./assignees');
const { canReview } = require('./taskFlow');
const { HttpError } = require('../utils/http');

async function canSeeTask(task, user, role) {
  if (role !== 'member') return true;
  const ids = await getAssigneeIds(task);
  if (!ids.length || ids.includes(user.id) || task.creatorId === user.id) return true;
  return task.status === 'review' && canReview(task, user, role);
}

async function assertCanSeeTask(task, user) {
  const role = await getRole(task.projectId, user);
  if (!(await canSeeTask(task, user, role))) {
    throw new HttpError(403, 'Bạn chỉ xem được công việc của mình. Chỉ trưởng nhóm theo dõi được tiến độ của các thành viên khác.');
  }
  return role;
}

// Điều kiện lọc danh sách công việc cho thành viên
function memberTaskFilter(projectId, userId) {
  const uid = Number(userId);
  const pid = Number(projectId);
  return {
    [Op.or]: [
      { id: { [Op.in]: sequelize.literal(`(SELECT task_id FROM task_assignees WHERE user_id = ${uid})`) } },
      { creatorId: uid },
      { id: { [Op.notIn]: sequelize.literal('(SELECT task_id FROM task_assignees)') } },
      {
        status: 'review',
        id: {
          [Op.in]: sequelize.literal(`(SELECT ta.task_id FROM task_assignees ta JOIN project_members pm ON pm.user_id = ta.user_id WHERE pm.project_id = ${pid} AND pm.role = 'leader')`),
        },
      },
    ],
  };
}

module.exports = { canSeeTask, assertCanSeeTask, memberTaskFilter };
