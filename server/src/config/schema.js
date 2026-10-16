const { DataTypes } = require('sequelize');
const {
  sequelize, TaskAssignee, Project, Label, PRIORITIES, PROJECT_ROLES,
} = require('../models');
const { normalizePhone } = require('../utils/phone');

// Cột thêm sau khi đã có dữ liệu thật. sequelize.sync() chỉ tạo bảng mới,
// không thêm cột vào bảng cũ, nên bổ sung tay để KHÔNG phải xóa dữ liệu.
const ADDED_COLUMNS = [
  { table: 'tasks', column: 'progress', spec: { type: DataTypes.INTEGER, defaultValue: 0 } },
  { table: 'tasks', column: 'submitted_at', spec: { type: DataTypes.DATE } },
  { table: 'tasks', column: 'reminded_soon_for', spec: { type: DataTypes.DATEONLY } },
  { table: 'tasks', column: 'overdue_reminded_on', spec: { type: DataTypes.DATEONLY } },
  { table: 'users', column: 'student_code', spec: { type: DataTypes.STRING(20) } },
  { table: 'users', column: 'class_name', spec: { type: DataTypes.STRING(50) } },
  { table: 'users', column: 'phone', spec: { type: DataTypes.STRING(15) } },
  { table: 'users', column: 'date_of_birth', spec: { type: DataTypes.DATEONLY } },
  { table: 'users', column: 'bio', spec: { type: DataTypes.STRING(500) } },
  { table: 'users', column: 'reset_token_hash', spec: { type: DataTypes.STRING(64) } },
  { table: 'users', column: 'reset_token_expires', spec: { type: DataTypes.DATE } },
  { table: 'users', column: 'password_changed_at', spec: { type: DataTypes.DATE } },
  { table: 'users', column: 'google_id', spec: { type: DataTypes.STRING(64) } },
  { table: 'users', column: 'avatar_url', spec: { type: DataTypes.STRING(255) } },
  { table: 'tasks', column: 'start_date', spec: { type: DataTypes.DATEONLY } },
  { table: 'tasks', column: 'due_today_reminded_for', spec: { type: DataTypes.DATEONLY } },
  { table: 'tasks', column: 'due_time', spec: { type: DataTypes.STRING(5) } },
  { table: 'tasks', column: 'last_urgent_at', spec: { type: DataTypes.DATE } },
  { table: 'projects', column: 'completed_at', spec: { type: DataTypes.DATE } },
  { table: 'tasks', column: 'submitted_late_minutes', spec: { type: DataTypes.INTEGER, defaultValue: 0 } },
  { table: 'users', column: 'has_password', spec: { type: DataTypes.BOOLEAN, defaultValue: true } },
];

// Nhãn mặc định cho mỗi dự án
const DEFAULT_LABELS = [['Bug', '#dc2626'], ['Tính năng', '#2563eb'], ['Tài liệu', '#16a34a'], ['Thiết kế', '#9333ea']];

async function addDefaultLabels(projectId, transaction) {
  await Label.bulkCreate(DEFAULT_LABELS.map(([name, color]) => ({ projectId, name, color })), { transaction });
}

// Thêm giá trị mới cho cột kiểu ENUM (VD ưu tiên "urgent", vai trò "guest").
// SQLite lưu dạng chữ, không ràng buộc; SQL Server dùng CHECK; MySQL dùng ENUM.
async function ensureEnumValues(table, column, values) {
  const dialect = sequelize.getDialect();
  if (dialect === 'mssql') {
    const [checks] = await sequelize.query(
      `SELECT cc.name, cc.definition FROM sys.check_constraints cc
       JOIN sys.columns c ON c.object_id = cc.parent_object_id AND c.column_id = cc.parent_column_id
       WHERE OBJECT_NAME(cc.parent_object_id) = N'${table}' AND c.name = N'${column}'`,
    );
    if (checks.length && values.every((v) => checks[0].definition.includes(`N'${v}'`))) return;
    for (const ck of checks) await sequelize.query(`ALTER TABLE [${table}] DROP CONSTRAINT [${ck.name}]`);
    await sequelize.query(`ALTER TABLE [${table}] ADD CONSTRAINT [CK_${table}_${column}] CHECK ([${column}] IN (${values.map((v) => `N'${v}'`).join(', ')}))`);
    console.log(`Đã cập nhật giá trị cho ${table}.${column}: ${values.join(', ')}`);
  } else if (dialect === 'mysql') {
    await sequelize.query(`ALTER TABLE \`${table}\` MODIFY \`${column}\` ENUM(${values.map((v) => `'${v}'`).join(', ')})`);
  }
}

async function ensureSchema() {
  const qi0 = sequelize.getQueryInterface();
  const hadLabels = (await qi0.showAllTables()).map((t) => (typeof t === 'string' ? t : t.tableName)).includes('labels');
  await sequelize.sync();
  const qi = sequelize.getQueryInterface();
  for (const { table, column, spec } of ADDED_COLUMNS) {
    const columns = await qi.describeTable(table);
    if (!columns[column]) {
      await qi.addColumn(table, column, spec);
      console.log(`Đã thêm cột ${table}.${column}`);
    }
  }
  await allowPhoneOnlyAccounts();
  await ensureEnumValues('tasks', 'priority', PRIORITIES);
  // Bỏ mức ưu tiên Thấp / Cao: chỉ còn Thường và Khẩn cấp
  await sequelize.query("UPDATE tasks SET priority = 'medium' WHERE priority IN ('low', 'high')");
  // Đã bỏ tính năng checklist
  const tablesNow = (await qi0.showAllTables()).map((t) => (typeof t === 'string' ? t : t.tableName));
  if (tablesNow.includes('checklist_items')) {
    await qi0.dropTable('checklist_items');
    console.log('Đã xóa bảng checklist_items (bỏ tính năng checklist)');
  }
  await ensureEnumValues('project_members', 'role', PROJECT_ROLES);
  await ensureEnumValues('project_invitations', 'role', PROJECT_ROLES);
  // Lần đầu có bảng nhãn: tạo nhãn mặc định cho các dự án đang có
  if (!hadLabels) {
    for (const p of await Project.findAll({ attributes: ['id'] })) await addDefaultLabels(p.id);
  }
  // Dữ liệu cũ (mỗi việc 1 người ở tasks.assignee_id) → chuyển sang bảng task_assignees
  const [rows] = await sequelize.query(
    'SELECT id, assignee_id FROM tasks WHERE assignee_id IS NOT NULL AND id NOT IN (SELECT task_id FROM task_assignees)',
  );
  for (const r of rows) await TaskAssignee.create({ taskId: r.id, userId: r.assignee_id });
  if (rows.length) console.log(`Đã chuyển ${rows.length} công việc sang dạng nhiều người làm`);
}

// Cột email cho phép để trống (giữ tương thích dữ liệu); chuẩn hóa số điện thoại trong hồ sơ
async function allowPhoneOnlyAccounts() {
  const qi = sequelize.getQueryInterface();
  const cols = await qi.describeTable('users');
  if (cols.email && cols.email.allowNull === false) {
    if (sequelize.getDialect() === 'sqlite') {
      // SQLite không đổi được NOT NULL tại chỗ → dựng lại bảng users, giữ nguyên dữ liệu và id
      const [[row]] = await sequelize.query("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'");
      const createNew = row.sql
        .replace('`email` VARCHAR(150) NOT NULL UNIQUE', '`email` VARCHAR(150) UNIQUE')
        .replace('CREATE TABLE `users`', 'CREATE TABLE `users_new`');
      if (!createNew.includes('`email` VARCHAR(150) UNIQUE')) throw new Error('Không nhận ra cấu trúc bảng users để chuyển đổi');
      const [indexes] = await sequelize.query("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='users' AND sql IS NOT NULL");
      await sequelize.query('PRAGMA foreign_keys = OFF');
      try {
        await sequelize.query(createNew);
        await sequelize.query('INSERT INTO `users_new` SELECT * FROM `users`');
        await sequelize.query('DROP TABLE `users`');
        await sequelize.query('ALTER TABLE `users_new` RENAME TO `users`');
        for (const idx of indexes) await sequelize.query(idx.sql);
      } finally {
        await sequelize.query('PRAGMA foreign_keys = ON');
      }
    } else {
      await qi.changeColumn('users', 'email', { type: DataTypes.STRING(150), allowNull: true });
    }
    console.log('Đã cho phép cột email để trống');
  }

  // Chuẩn hóa số điện thoại đã lưu rồi tạo chỉ mục duy nhất
  const [phones] = await sequelize.query('SELECT id, phone FROM users WHERE phone IS NOT NULL');
  for (const { id, phone } of phones) {
    const norm = normalizePhone(phone);
    if (norm !== phone) await sequelize.query('UPDATE users SET phone = ? WHERE id = ?', { replacements: [norm, id] });
  }
  // Số điện thoại chỉ là thông tin liên lạc → không cần duy nhất (bỏ chỉ mục từng tạo trước đây)
  const existing = await qi.showIndex('users');
  if (existing.some((i) => i.name === 'users_phone_unique')) await qi.removeIndex('users', 'users_phone_unique');
}

module.exports = { ensureSchema, addDefaultLabels };
