const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];

const User = sequelize.define('User', {
  fullName: { type: DataTypes.STRING(100), allowNull: false },
  email: { type: DataTypes.STRING(150), allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  systemRole: { type: DataTypes.ENUM('admin', 'user'), defaultValue: 'user' },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  // Thông tin cá nhân do mỗi người tự cập nhật ở trang Hồ sơ
  studentCode: { type: DataTypes.STRING(20) }, // MSSV
  className: { type: DataTypes.STRING(50) }, // Lớp
  phone: { type: DataTypes.STRING(15) },
  dateOfBirth: { type: DataTypes.DATEONLY },
  bio: { type: DataTypes.STRING(500) }, // Giới thiệu / kỹ năng
  // Đăng nhập bằng Google: id tài khoản Google; hasPassword = false nếu tạo bằng Google, chưa đặt mật khẩu
  googleId: { type: DataTypes.STRING(64) },
  hasPassword: { type: DataTypes.BOOLEAN, defaultValue: true },
  // Link đặt lại mật khẩu do admin tạo: chỉ lưu mã băm của token
  resetTokenHash: { type: DataTypes.STRING(64) },
  resetTokenExpires: { type: DataTypes.DATE },
  passwordChangedAt: { type: DataTypes.DATE }, // token đăng nhập cấp trước mốc này bị vô hiệu
}, { tableName: 'users', underscored: true });

// Không bao giờ trả mật khẩu đã băm ra ngoài API
User.prototype.toJSON = function toJSON() {
  const values = { ...this.get() };
  delete values.passwordHash;
  delete values.resetTokenHash;
  delete values.googleId;
  delete values.resetTokenExpires;
  delete values.passwordChangedAt;
  return values;
};

const Project = sequelize.define('Project', {
  name: { type: DataTypes.STRING(150), allowNull: false },
  description: { type: DataTypes.TEXT },
  startDate: { type: DataTypes.DATEONLY },
  endDate: { type: DataTypes.DATEONLY },
  status: { type: DataTypes.ENUM('active', 'archived'), defaultValue: 'active' },
}, { tableName: 'projects', underscored: true });

const ProjectMember = sequelize.define('ProjectMember', {
  projectId: { type: DataTypes.INTEGER, primaryKey: true },
  userId: { type: DataTypes.INTEGER, primaryKey: true },
  role: { type: DataTypes.ENUM('leader', 'member'), defaultValue: 'member' },
}, { tableName: 'project_members', underscored: true });

const Task = sequelize.define('Task', {
  title: { type: DataTypes.STRING(200), allowNull: false },
  description: { type: DataTypes.TEXT },
  status: { type: DataTypes.ENUM(...TASK_STATUSES), defaultValue: 'todo' },
  priority: { type: DataTypes.ENUM(...PRIORITIES), defaultValue: 'medium' },
  dueDate: { type: DataTypes.DATEONLY },
  position: { type: DataTypes.INTEGER, defaultValue: 0 },
  progress: { type: DataTypes.INTEGER, defaultValue: 0 }, // % hoàn thành do người làm tự cập nhật
  submittedAt: { type: DataTypes.DATE }, // lần gửi bài gần nhất, chờ trưởng nhóm duyệt
  remindedSoonFor: { type: DataTypes.DATEONLY }, // đã nhắc "sắp đến hạn" cho hạn này
  overdueRemindedOn: { type: DataTypes.DATEONLY }, // ngày gần nhất đã nhắc "quá hạn" (nhắc mỗi ngày 1 lần)
  completedAt: { type: DataTypes.DATE },
}, { tableName: 'tasks', underscored: true });

const Comment = sequelize.define('Comment', {
  content: { type: DataTypes.TEXT, allowNull: false },
}, { tableName: 'comments', underscored: true });

// Một công việc có thể giao cho nhiều người (bảng trung gian nhiều–nhiều).
// Cột tasks.assignee_id vẫn giữ = người đầu tiên để tương thích dữ liệu cũ.
const TaskAssignee = sequelize.define('TaskAssignee', {
  taskId: { type: DataTypes.INTEGER, primaryKey: true },
  userId: { type: DataTypes.INTEGER, primaryKey: true },
}, { tableName: 'task_assignees', underscored: true });

// File thành viên nộp trong công việc; nội dung lưu ở thư mục uploads/, DB chỉ giữ thông tin
const Attachment = sequelize.define('Attachment', {
  originalName: { type: DataTypes.STRING(255), allowNull: false },
  storedName: { type: DataTypes.STRING(255), allowNull: false },
  mimeType: { type: DataTypes.STRING(150) },
  size: { type: DataTypes.INTEGER },
  note: { type: DataTypes.STRING(500) },
}, { tableName: 'attachments', underscored: true });

// Nhận xét của trưởng nhóm cho mỗi lần xem bài: phần làm tốt + phần cần bổ sung
const TaskReview = sequelize.define('TaskReview', {
  decision: { type: DataTypes.ENUM('start', 'comment', 'approve', 'reject'), allowNull: false },
  goodPoints: { type: DataTypes.TEXT },
  improvements: { type: DataTypes.TEXT },
}, { tableName: 'task_reviews', underscored: true });

const ActivityLog = sequelize.define('ActivityLog', {
  action: { type: DataTypes.STRING(50), allowNull: false },
  detail: { type: DataTypes.STRING(255) },
}, { tableName: 'activity_logs', underscored: true });

const WeeklyReport = sequelize.define('WeeklyReport', {
  weekStart: { type: DataTypes.DATEONLY, allowNull: false },
  doneText: { type: DataTypes.TEXT },
  planText: { type: DataTypes.TEXT },
  issuesText: { type: DataTypes.TEXT },
  status: { type: DataTypes.ENUM('draft', 'submitted', 'reviewed'), defaultValue: 'draft' },
  feedback: { type: DataTypes.TEXT },
  score: { type: DataTypes.FLOAT },
}, {
  tableName: 'weekly_reports',
  underscored: true,
  indexes: [{ unique: true, fields: ['project_id', 'user_id', 'week_start'] }],
});

const Notification = sequelize.define('Notification', {
  type: { type: DataTypes.STRING(50), allowNull: false },
  message: { type: DataTypes.STRING(255), allowNull: false },
  link: { type: DataTypes.STRING(255) },
  isRead: { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'notifications', underscored: true });

// Lời mời gửi tới email chưa có tài khoản; tự chấp nhận khi người đó đăng ký
const Invitation = sequelize.define('Invitation', {
  email: { type: DataTypes.STRING(150), allowNull: false },
  role: { type: DataTypes.ENUM('leader', 'member'), defaultValue: 'member' },
  token: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  status: { type: DataTypes.ENUM('pending', 'accepted', 'cancelled'), defaultValue: 'pending' },
}, { tableName: 'project_invitations', underscored: true });

// ----- Quan hệ -----
User.belongsToMany(Project, { through: ProjectMember, as: 'projects', foreignKey: 'userId', otherKey: 'projectId' });
Project.belongsToMany(User, { through: ProjectMember, as: 'members', foreignKey: 'projectId', otherKey: 'userId' });
Project.belongsTo(User, { as: 'owner', foreignKey: 'ownerId' });

Project.hasMany(Task, { foreignKey: 'projectId', onDelete: 'CASCADE' });
Task.belongsTo(Project, { foreignKey: 'projectId' });
Task.belongsTo(User, { as: 'assignee', foreignKey: 'assigneeId' });
Task.belongsTo(User, { as: 'creator', foreignKey: 'creatorId' });
Task.belongsToMany(User, { through: TaskAssignee, as: 'assignees', foreignKey: 'taskId', otherKey: 'userId' });
Task.hasMany(TaskAssignee, { as: 'assigneeLinks', foreignKey: 'taskId', onDelete: 'CASCADE' });

Task.hasMany(Comment, { as: 'comments', foreignKey: 'taskId', onDelete: 'CASCADE' });
Comment.belongsTo(User, { as: 'author', foreignKey: 'userId' });

Task.hasMany(Attachment, { as: 'attachments', foreignKey: 'taskId', onDelete: 'CASCADE' });
Attachment.belongsTo(Task, { foreignKey: 'taskId' });
Attachment.belongsTo(User, { as: 'uploader', foreignKey: 'uploaderId' });

Task.hasMany(TaskReview, { as: 'reviews', foreignKey: 'taskId', onDelete: 'CASCADE' });
TaskReview.belongsTo(User, { as: 'reviewer', foreignKey: 'reviewerId' });

Task.hasMany(ActivityLog, { as: 'logs', foreignKey: 'taskId', onDelete: 'CASCADE' });
ActivityLog.belongsTo(User, { as: 'actor', foreignKey: 'userId' });

Project.hasMany(WeeklyReport, { foreignKey: 'projectId', onDelete: 'CASCADE' });
WeeklyReport.belongsTo(Project, { foreignKey: 'projectId' });
WeeklyReport.belongsTo(User, { as: 'author', foreignKey: 'userId' });
WeeklyReport.belongsTo(User, { as: 'reviewer', foreignKey: 'reviewedBy' });

Project.hasMany(Invitation, { foreignKey: 'projectId', onDelete: 'CASCADE' });
Invitation.belongsTo(Project, { foreignKey: 'projectId' });
Invitation.belongsTo(User, { as: 'inviter', foreignKey: 'invitedBy' });

User.hasMany(Notification, { foreignKey: 'userId', onDelete: 'CASCADE' });
Notification.belongsTo(User, { foreignKey: 'userId' });

module.exports = {
  sequelize,
  TASK_STATUSES,
  PRIORITIES,
  User,
  Project,
  ProjectMember,
  Task,
  Comment,
  ActivityLog,
  WeeklyReport,
  Notification,
  Invitation,
  Attachment,
  TaskReview,
  TaskAssignee,
};
