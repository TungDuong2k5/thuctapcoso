// Sao chép toàn bộ dữ liệu TaskFlow (SQLite đang dùng) sang database "TaskFlow" trong SQL Server
// để xem / truy vấn bằng SQL Server Management Studio (SSMS).
// Chạy: npm run export-sqlserver   (hoặc bấm đúp xuat-sang-sqlserver.bat ở thư mục taskflow)
// Đây là BẢN SAO tại thời điểm chạy; app vẫn ghi vào SQLite, chạy lại để cập nhật.
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const models = require('../src/models');

const { sequelize } = models;
const DB_NAME = process.env.SQLSERVER_DB || 'TaskFlow';
const SERVER = process.env.SQLSERVER_HOST || 'localhost';
const OUT = path.resolve(__dirname, '../../database/taskflow_sqlserver.sql');

// Thứ tự tạo bảng: bảng cha trước, bảng con sau
const ORDER = ['User', 'Project', 'ProjectMember', 'Invitation', 'Task', 'TaskAssignee',
  'Attachment', 'TaskReview', 'Comment', 'ActivityLog', 'WeeklyReport', 'Notification'];

const q = (name) => `[${name}]`;

function sqlType(attr) {
  const key = attr.type.key;
  const len = attr.type.options?.length || attr.type._length;
  switch (key) {
    case 'INTEGER': return 'INT';
    case 'STRING': return `NVARCHAR(${len || 255})`;
    case 'TEXT': return 'NVARCHAR(MAX)';
    case 'BOOLEAN': return 'BIT';
    case 'DATE': return 'DATETIME2';
    case 'DATEONLY': return 'DATE';
    case 'FLOAT': return 'FLOAT';
    case 'ENUM': return `NVARCHAR(${Math.max(...attr.values.map((v) => v.length))})`;
    default: throw new Error(`Chưa hỗ trợ kiểu ${key}`);
  }
}

function lit(value, attr) {
  if (value === null || value === undefined) return 'NULL';
  const key = attr.type.key;
  if (key === 'BOOLEAN') return value === true || value === 1 || value === '1' ? '1' : '0';
  if (key === 'INTEGER' || key === 'FLOAT') return String(Number(value));
  if (key === 'DATE') {
    const d = value instanceof Date ? value : new Date(String(value).replace(' +00:00', 'Z').replace(' ', 'T'));
    return `'${d.toISOString().replace('Z', '')}'`;
  }
  if (key === 'DATEONLY') return `'${String(value).slice(0, 10)}'`;
  return `N'${String(value).split("'").join("''")}'`;
}

function tableDDL(model) {
  const table = model.getTableName();
  const attrs = Object.values(model.rawAttributes);
  const pk = attrs.filter((a) => a.primaryKey);
  const lines = attrs.map((a) => {
    let line = `  ${q(a.field)} ${sqlType(a)}`;
    if (a.autoIncrement) line += ' IDENTITY(1,1)';
    if (a.allowNull === false || a.primaryKey) line += ' NOT NULL';
    if (a.type.key === 'ENUM') line += ` CHECK (${q(a.field)} IN (${a.values.map((v) => `N'${v}'`).join(', ')}))`;
    return line;
  });
  lines.push(`  CONSTRAINT ${q(`PK_${table}`)} PRIMARY KEY (${pk.map((a) => q(a.field)).join(', ')})`);
  attrs.filter((a) => a.unique && !a.primaryKey).forEach((a) => {
    // UNIQUE nhưng cho phép nhiều NULL → dùng chỉ mục lọc (filtered index) tạo phía dưới
    a._uniqueIndex = true;
  });
  attrs.filter((a) => a.references).forEach((a) => {
    const ref = typeof a.references.model === 'string' ? a.references.model : a.references.model.tableName;
    // Bản sao chỉ để xem: dùng NO ACTION, tránh lỗi "multiple cascade paths" của SQL Server
    lines.push(`  CONSTRAINT ${q(`FK_${table}_${a.field}`)} FOREIGN KEY (${q(a.field)}) REFERENCES ${q(ref)} (${q(a.references.key || 'id')})`);
  });
  let sql = `CREATE TABLE ${q(table)} (\n${lines.join(',\n')}\n);\n`;
  attrs.filter((a) => a._uniqueIndex).forEach((a) => {
    sql += `CREATE UNIQUE INDEX ${q(`UQ_${table}_${a.field}`)} ON ${q(table)} (${q(a.field)}) WHERE ${q(a.field)} IS NOT NULL;\n`;
  });
  (model.options.indexes || []).filter((i) => i.unique).forEach((i) => {
    sql += `CREATE UNIQUE INDEX ${q(`UQ_${table}_${i.fields.join('_')}`)} ON ${q(table)} (${i.fields.map(q).join(', ')});\n`;
  });
  return sql;
}

async function tableData(model) {
  const table = model.getTableName();
  const attrs = Object.values(model.rawAttributes);
  const [rows] = await sequelize.query(`SELECT * FROM \`${table}\``);
  if (!rows.length) return `-- ${table}: không có dữ liệu\n`;
  const cols = attrs.map((a) => q(a.field)).join(', ');
  const identity = attrs.some((a) => a.autoIncrement);
  let sql = `-- ${table}: ${rows.length} dòng\n`;
  if (identity) sql += `SET IDENTITY_INSERT ${q(table)} ON;\n`;
  // SQL Server cho tối đa 1000 dòng mỗi lệnh INSERT ... VALUES
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    sql += `INSERT INTO ${q(table)} (${cols}) VALUES\n${chunk.map((r) => `  (${attrs.map((a) => lit(r[a.field], a)).join(', ')})`).join(',\n')};\n`;
  }
  if (identity) sql += `SET IDENTITY_INSERT ${q(table)} OFF;\n`;
  return sql;
}

(async () => {
  if ((process.env.DB_DIALECT || 'sqlite') === 'mssql') {
    console.log('App đang dùng TRỰC TIẾP SQL Server (DB_DIALECT=mssql) nên không cần sao chép nữa.');
    console.log('Mở SSMS, kết nối localhost, vào Databases > TaskFlow là thấy dữ liệu mới nhất.');
    return;
  }
  const list = ORDER.map((n) => models[n]);
  let sql = `-- TaskFlow: bản sao dữ liệu sang SQL Server (tạo lúc ${new Date().toLocaleString('vi-VN')})\n`
    + '-- Tạo bởi server/scripts/export-sqlserver.js. Chạy lại script để cập nhật bản sao.\n\n'
    + 'SET QUOTED_IDENTIFIER ON;\nSET ANSI_NULLS ON;\nGO\n' // cần cho chỉ mục lọc (UNIQUE cho phép nhiều NULL)
    + `IF DB_ID(N'${DB_NAME}') IS NULL CREATE DATABASE ${q(DB_NAME)};\nGO\nUSE ${q(DB_NAME)};\nGO\n\n`
    + '-- Xóa bảng cũ (bảng con trước)\n'
    + [...list].reverse().map((m) => `IF OBJECT_ID(N'${m.getTableName()}', N'U') IS NOT NULL DROP TABLE ${q(m.getTableName())};`).join('\n')
    + '\nGO\n\n-- ===== CẤU TRÚC BẢNG =====\n';
  for (const m of list) sql += `\n${tableDDL(m)}GO\n`;
  sql += '\n-- ===== DỮ LIỆU =====\n';
  for (const m of list) sql += `\n${await tableData(m)}GO\n`;
  await sequelize.close();

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `﻿${sql}`, 'utf8'); // BOM để SSMS / sqlcmd đọc đúng tiếng Việt
  console.log(`Đã tạo script: ${OUT}`);

  if (process.argv.includes('--no-run')) return;
  console.log(`Đang nạp vào SQL Server "${SERVER}", database "${DB_NAME}" (đăng nhập bằng tài khoản Windows)...`);
  execFileSync('sqlcmd', ['-S', SERVER, '-E', '-C', '-I', '-b', '-f', '65001', '-i', OUT], { stdio: 'inherit' });
  console.log(`\nXong! Mở SQL Server Management Studio, kết nối "${SERVER}" (Windows Authentication), vào Databases > ${DB_NAME} > Tables.`);
})().catch((err) => {
  console.error('\nLỗi:', err.message);
  process.exit(1);
});
