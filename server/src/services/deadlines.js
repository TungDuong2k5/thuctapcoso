// Nhắc hạn tự động (chạy định kỳ trong server.js, mỗi 5 phút):
// - Còn dưới 2 ngày mà chưa gửi bài → nhắc người làm (thông báo thường), 1 lần cho mỗi hạn
// - Còn dưới 1 NGÀY mà chưa gửi bài → THÔNG BÁO KHẨN cho người làm, 1 lần cho mỗi hạn
// - Còn dưới 3 TIẾNG mà chưa gửi bài → THÔNG BÁO KHẨN LẶP LẠI mỗi 15 phút cho đến khi nộp hoặc hết hạn
// - QUÁ HẠN (quá ngày + giờ hết hạn) mà chưa gửi bài → THÔNG BÁO KHẨN mỗi ngày 1 lần
//   cho người làm + trưởng nhóm (thành viên không theo dõi tiến độ của người khác)
// - Đã gửi bài nhưng quá hạn chưa duyệt → nhắc người nhận xét
const { Op } = require('sequelize');
const {
  Task, Project, User, ProjectMember,
} = require('../models');
const { reviewerIds } = require('./taskFlow');
const { notify, URGENT_TYPES } = require('./notify');
const { deadlineOf, formatDeadline, formatDuration } = require('../utils/deadline');

const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const HOUR = 3600 * 1000;
const SPAM_EVERY = 15 * 60 * 1000; // 3 tiếng cuối: nhắc lại mỗi 15 phút

// Ngày theo giờ Việt Nam dạng YYYY-MM-DD
function vnDate(offsetDays = 0, now = Date.now()) {
  return new Date(now + offsetDays * 864e5).toLocaleDateString('sv-SE', { timeZone: TIME_ZONE });
}

async function checkDeadlines(now = Date.now()) {
  const nowDate = new Date(now);
  const today = vnDate(0, now);
  const tomorrow = vnDate(1, now);
  const tasks = await Task.findAll({
    where: { status: { [Op.ne]: 'done' }, dueDate: { [Op.ne]: null, [Op.lte]: vnDate(2, now) } },
    include: [
      { model: Project, where: { status: 'active' }, attributes: ['id', 'name'] },
      { model: User, as: 'assignees', attributes: ['id', 'fullName'], through: { attributes: [] } },
    ],
  });

  let sent = 0;
  for (const t of tasks) {
    const link = `/projects/${t.projectId}?task=${t.id}`;
    const leaders = (await ProjectMember.findAll({ where: { projectId: t.projectId, role: 'leader' } })).map((m) => m.userId);
    const assigneeIds = t.assignees.map((u) => u.id);
    const worker = assigneeIds.length ? assigneeIds : leaders;
    const names = t.assignees.map((u) => u.fullName).join(', ') || 'chưa giao';
    const where = `(${t.Project.name})`;
    // Đã gửi bài hoặc đang chờ nhận xét (Review) → không nhắc người làm nữa
    const handedIn = Boolean(t.submittedAt) || t.status === 'review';
    const deadline = deadlineOf(t);
    const left = deadline - nowDate;

    if (left < 0) {
      // ----- Quá hạn: nhắc mỗi ngày 1 lần -----
      if (t.overdueRemindedOn === today) continue;
      if (handedIn) {
        await notify(await reviewerIds(t), null, {
          type: 'deadline_review',
          message: `Bài "${t.title}" ${where} đã gửi, quá hạn ${formatDeadline(t)} vẫn chưa được nhận xét xong`,
          link,
        });
      } else {
        const late = formatDuration(Math.ceil(-left / 60000));
        await notify(worker, null, {
          type: 'deadline_overdue',
          message: `🚨 KHẨN – Quá hạn: "${t.title}" ${where} đã trễ ${late} (hạn ${formatDeadline(t)}) mà chưa hoàn thành. Vẫn nộp được nhưng sẽ bị ghi Nộp muộn!`,
          link,
        });
        // Chỉ trưởng nhóm theo dõi tiến độ của người khác
        await notify(leaders.filter((id) => !worker.includes(id)), null, {
          type: 'deadline_overdue',
          message: `🚨 KHẨN: "${t.title}" ${where} của ${names} đã quá hạn ${formatDeadline(t)} (trễ ${late}) mà chưa hoàn thành`,
          link,
        });
      }
      t.overdueRemindedOn = today;
    } else if (handedIn) {
      continue; // đã gửi bài trước hạn → không cần nhắc
    } else {
      const leftText = formatDuration(Math.max(1, Math.floor(left / 60000)));
      const day = t.dueDate === today ? 'HÔM NAY' : t.dueDate === tomorrow ? 'NGÀY MAI' : `ngày ${formatDeadline({ dueDate: t.dueDate })}`;
      const at = `${day} lúc ${t.dueTime || '23:59'}`;

      if (left <= 3 * HOUR) {
        // ----- 3 tiếng cuối: nhắc liên tục mỗi 15 phút -----
        if (t.lastUrgentAt && nowDate - new Date(t.lastUrgentAt) < SPAM_EVERY) continue;
        await notify(worker, null, {
          type: 'deadline_today',
          message: `🚨 KHẨN – Chỉ còn ${leftText}! "${t.title}" ${where} hết hạn ${at} mà bạn chưa gửi báo cáo. Nộp ngay!`,
          link,
        });
        t.lastUrgentAt = nowDate;
        t.dueTodayRemindedFor = t.dueDate;
        t.remindedSoonFor = t.dueDate;
      } else if (left <= 24 * HOUR) {
        // ----- Còn dưới 1 ngày: báo khẩn 1 lần -----
        if (t.dueTodayRemindedFor === t.dueDate) continue;
        await notify(worker, null, {
          type: 'deadline_today',
          message: `🚨 KHẨN – Sắp đến hạn: "${t.title}" ${where} hết hạn ${at}, còn chưa đầy 1 ngày (${leftText}) mà bạn chưa gửi báo cáo`,
          link,
        });
        t.dueTodayRemindedFor = t.dueDate;
        t.remindedSoonFor = t.dueDate;
      } else {
        // ----- Còn dưới 2 ngày: nhắc thường 1 lần -----
        if (t.remindedSoonFor === t.dueDate || left > 48 * HOUR) continue;
        await notify(worker, null, {
          type: 'deadline_soon',
          message: `Sắp đến hạn: "${t.title}" ${where} hết hạn ${at} (còn ${leftText})`,
          link,
        });
        t.remindedSoonFor = t.dueDate;
      }
    }
    await t.save();
    sent += 1;
  }
  return sent;
}

function startDeadlineScheduler(intervalMinutes = 5) {
  const run = () => checkDeadlines()
    .then((n) => n && console.log(`Đã gửi ${n} nhắc hạn`))
    .catch((err) => console.error('Lỗi nhắc hạn:', err.message));
  run();
  return setInterval(run, intervalMinutes * 60 * 1000);
}

module.exports = {
  checkDeadlines, startDeadlineScheduler, vnDate, URGENT_TYPES,
};
