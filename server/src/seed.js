// Tạo dữ liệu mẫu để demo. CẢNH BÁO: xóa toàn bộ dữ liệu cũ.
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const {
  sequelize, User, Project, ProjectMember, Task, Comment, WeeklyReport, TaskAssignee,
} = require('./models');
const { mondayOf } = require('./utils/http');

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function seed() {
  if ((process.env.DB_DIALECT || 'sqlite') === 'sqlite') {
    fs.mkdirSync(path.resolve(__dirname, '../data'), { recursive: true });
  }
  // Không xóa nhầm dữ liệu thật: nếu đã có người dùng thì phải chạy kèm --force
  await sequelize.sync();
  const existing = await User.count();
  if (existing > 0 && !process.argv.includes('--force')) {
    console.log(`CSDL đang có ${existing} tài khoản. Lệnh seed sẽ XÓA TOÀN BỘ dữ liệu.`);
    console.log('Nếu chắc chắn muốn làm lại từ đầu, chạy: npm run seed -- --force');
    await sequelize.close();
    return;
  }
  await sequelize.sync({ force: true });
  const passwordHash = await bcrypt.hash('123456', 10);

  const [admin, an, binh, chi] = await User.bulkCreate([
    { fullName: 'Quản trị viên', email: 'admin@taskflow.local', passwordHash, systemRole: 'admin' },
    { fullName: 'Nguyễn Văn An', email: 'an@taskflow.local', passwordHash },
    { fullName: 'Trần Thị Bình', email: 'binh@taskflow.local', passwordHash },
    { fullName: 'Lê Minh Chi', email: 'chi@taskflow.local', passwordHash },
  ]);

  const project = await Project.create({
    name: 'Thực tập cơ sở - TaskFlow',
    description: 'Xây dựng hệ thống quản lý và báo cáo công việc nhóm',
    startDate: daysFromNow(-14),
    endDate: daysFromNow(56),
    ownerId: an.id,
  });
  await ProjectMember.bulkCreate([
    { projectId: project.id, userId: an.id, role: 'leader' },
    { projectId: project.id, userId: binh.id, role: 'member' },
    { projectId: project.id, userId: chi.id, role: 'member' },
  ]);

  const tasks = [
    ['Tìm hiểu Git và GitHub', 'done', an, -10, 'high'],
    ['Viết báo cáo tìm hiểu Git', 'done', binh, -5, 'medium'],
    ['Tạo repository và phân quyền cho giảng viên', 'done', an, -4, 'high'],
    ['Vẽ sơ đồ use case', 'review', chi, 1, 'medium'],
    ['Thiết kế ERD', 'in_progress', binh, 3, 'high'],
    ['API đăng nhập / đăng ký', 'in_progress', an, 4, 'high'],
    ['Giao diện bảng Kanban', 'todo', chi, 10, 'medium'],
    ['Xuất báo cáo PDF', 'todo', null, 30, 'low'],
    ['Viết Dockerfile cho client', 'todo', binh, -1, 'medium'],
  ];
  const created = [];
  for (const [i, [title, status, assignee, due, priority]] of tasks.entries()) {
    created.push(await Task.create({
      projectId: project.id,
      title,
      status,
      priority,
      assigneeId: assignee?.id || null,
      creatorId: an.id,
      dueDate: daysFromNow(due),
      position: i,
      completedAt: status === 'done' ? new Date(Date.now() + due * 864e5) : null,
    }));
    if (assignee) await TaskAssignee.create({ taskId: created.at(-1).id, userId: assignee.id });
  }

  await Comment.create({ taskId: created[3].id, userId: an.id, content: 'Bổ sung use case "Nộp báo cáo tuần" nhé.' });

  await WeeklyReport.create({
    projectId: project.id,
    userId: binh.id,
    weekStart: mondayOf(daysFromNow(-7)),
    doneText: '- Viết báo cáo tìm hiểu Git',
    planText: '- Thiết kế ERD',
    issuesText: 'Chưa quen cách vẽ quan hệ n-n',
    status: 'submitted',
  });

  console.log('Đã tạo dữ liệu mẫu. Mật khẩu mọi tài khoản: 123456');
  console.log([admin, an, binh, chi].map((u) => `  ${u.email}`).join('\n'));
  await sequelize.close();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
