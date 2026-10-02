const { DataTypes } = require('sequelize');
const { sequelize, TaskAssignee } = require('../models');

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
  { table: 'users', column: 'has_password', spec: { type: DataTypes.BOOLEAN, defaultValue: true } },
];

async function ensureSchema() {
  await sequelize.sync();
  const qi = sequelize.getQueryInterface();
  for (const { table, column, spec } of ADDED_COLUMNS) {
    const columns = await qi.describeTable(table);
    if (!columns[column]) {
      await qi.addColumn(table, column, spec);
      console.log(`Đã thêm cột ${table}.${column}`);
    }
  }
  // Dữ liệu cũ (mỗi việc 1 người ở tasks.assignee_id) → chuyển sang bảng task_assignees
  const [rows] = await sequelize.query(
    'SELECT id, assignee_id FROM tasks WHERE assignee_id IS NOT NULL AND id NOT IN (SELECT task_id FROM task_assignees)',
  );
  for (const r of rows) await TaskAssignee.create({ taskId: r.id, userId: r.assignee_id });
  if (rows.length) console.log(`Đã chuyển ${rows.length} công việc sang dạng nhiều người làm`);
}

module.exports = { ensureSchema };
