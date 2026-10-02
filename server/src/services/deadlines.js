// Nhắc hạn tự động (chạy định kỳ trong server.js):
// - Sắp đến hạn (hôm nay/ngày mai) mà chưa gửi bài → nhắc người làm, 1 lần cho mỗi hạn
// - Quá hạn mà chưa gửi bài → nhắc người làm + báo trưởng nhóm, mỗi ngày 1 lần
// - Đã gửi bài nhưng quá hạn chưa duyệt → nhắc trưởng nhóm duyệt
const { Op } = require('sequelize');
const { Task, Project, User } = require('../models');
const { leaderIds } = require('./projectAccess');
const { reviewerIds } = require('./taskFlow');
const { notify } = require('./notify');

const TIME_ZONE = 'Asia/Ho_Chi_Minh';

// Ngày theo giờ Việt Nam dạng YYYY-MM-DD
function vnDate(offsetDays = 0, now = Date.now()) {
  return new Date(now + offsetDays * 864e5).toLocaleDateString('sv-SE', { timeZone: TIME_ZONE });
}

const viDate = (iso) => iso.split('-').reverse().join('/');

async function checkDeadlines(now = Date.now()) {
  const today = vnDate(0, now);
  const tomorrow = vnDate(1, now);
  const tasks = await Task.findAll({
    where: { status: { [Op.ne]: 'done' }, dueDate: { [Op.ne]: null, [Op.lte]: tomorrow } },
    include: [
      { model: Project, where: { status: 'active' }, attributes: ['id', 'name'] },
      { model: User, as: 'assignees', attributes: ['id', 'fullName'], through: { attributes: [] } },
    ],
  });

  let sent = 0;
  for (const t of tasks) {
    const link = `/projects/${t.projectId}?task=${t.id}`;
    const leaders = await leaderIds(t.projectId);
    const assigneeIds = t.assignees.map((u) => u.id);
    const worker = assigneeIds.length ? assigneeIds : leaders;
    const names = t.assignees.map((u) => u.fullName).join(', ') || 'chưa giao';
    // Đã gửi bài hoặc trưởng nhóm đang xem (Review) → không nhắc thành viên nữa
    const handedIn = Boolean(t.submittedAt) || t.status === 'review';

    if (t.dueDate < today) {
      if (t.overdueRemindedOn === today) continue;
      if (handedIn) {
        await notify(await reviewerIds(t), null, {
          type: 'deadline_review',
          message: `Bài "${t.title}" (${t.Project.name}) đã gửi, quá hạn ${viDate(t.dueDate)} vẫn chưa được nhận xét xong`,
          link,
        });
      } else {
        await notify(worker, null, {
          type: 'deadline_overdue',
          message: `Quá hạn: "${t.title}" (hạn ${viDate(t.dueDate)}) chưa hoàn thành, hãy gửi bài sớm`,
          link,
        });
        const others = leaders.filter((id) => !worker.includes(id));
        await notify(others, null, {
          type: 'deadline_overdue',
          message: `"${t.title}" của ${names} đã quá hạn ${viDate(t.dueDate)} mà chưa hoàn thành`,
          link,
        });
      }
      t.overdueRemindedOn = today;
      await t.save();
      sent += 1;
    } else if (!handedIn && t.remindedSoonFor !== t.dueDate) {
      await notify(worker, null, {
        type: 'deadline_soon',
        message: `Sắp đến hạn: "${t.title}" hết hạn ${t.dueDate === today ? 'HÔM NAY' : 'ngày mai'} (${viDate(t.dueDate)})`,
        link,
      });
      t.remindedSoonFor = t.dueDate;
      await t.save();
      sent += 1;
    }
  }
  return sent;
}

function startDeadlineScheduler(intervalMinutes = 30) {
  const run = () => checkDeadlines()
    .then((n) => n && console.log(`Đã gửi ${n} nhắc hạn`))
    .catch((err) => console.error('Lỗi nhắc hạn:', err.message));
  run();
  return setInterval(run, intervalMinutes * 60 * 1000);
}

module.exports = { checkDeadlines, startDeadlineScheduler, vnDate };
