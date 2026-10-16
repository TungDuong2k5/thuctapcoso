// Chuyển toàn bộ dữ liệu TaskFlow từ SQLite (server/data/taskflow.sqlite) sang SQL Server (database TaskFlow).
// Bảng trong SQL Server được tạo lại bằng chính các model của app, rồi chép từng dòng (giữ nguyên id).
// Chạy: node scripts/migrate-sqlite-to-mssql.js   (cần MSSQL_* trong server/.env)
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const path = require('path');
const { Sequelize } = require('sequelize');

process.env.DB_DIALECT = 'mssql'; // các model bên dưới sẽ trỏ vào SQL Server
const models = require('../src/models');
const { ensureSchema } = require('../src/config/schema');

const { sequelize: target } = models;
const sqlitePath = path.resolve(__dirname, '..', process.env.DB_STORAGE || './data/taskflow.sqlite');
const source = new Sequelize({ dialect: 'sqlite', storage: sqlitePath, logging: false });

// Bảng cha trước, bảng con sau
const ORDER = ['User', 'Project', 'ProjectMember', 'Invitation', 'Task', 'TaskAssignee',
  'Attachment', 'TaskReview', 'Comment', 'ActivityLog', 'WeeklyReport', 'Notification'];

function convert(value, attr) {
  if (value === null || value === undefined) return null;
  switch (attr.type.key) {
    case 'BOOLEAN': return value === true || Number(value) === 1;
    case 'INTEGER': return Number(value);
    case 'FLOAT': return Number(value);
    case 'DATE': return value instanceof Date ? value : new Date(String(value).replace(' +00:00', 'Z').replace(' ', 'T'));
    case 'DATEONLY': return String(value).slice(0, 10);
    default: return String(value);
  }
}

(async () => {
  await target.authenticate();
  console.log('Đã kết nối SQL Server.');
  const qi = target.getQueryInterface();
  const list = ORDER.map((n) => models[n]);

  // Xóa bảng cũ trong TaskFlow (bản sao để xem trước đây) rồi tạo lại đúng cấu trúc của app
  for (const m of [...list].reverse()) {
    await target.query(`IF OBJECT_ID(N'${m.getTableName()}', N'U') IS NOT NULL DROP TABLE [${m.getTableName()}];`);
  }
  await ensureSchema();
  console.log('Đã tạo 12 bảng trong SQL Server.');

  for (const m of list) {
    const table = m.getTableName();
    const attrs = Object.values(m.rawAttributes);
    const [rows] = await source.query(`SELECT * FROM \`${table}\``);
    const records = rows.map((r) => Object.fromEntries(attrs.map((a) => [a.field, convert(r[a.field], a)])));
    for (let i = 0; i < records.length; i += 200) {
      // truyền thuộc tính model để Sequelize tự bật IDENTITY_INSERT khi chép cả cột id
      await qi.bulkInsert(table, records.slice(i, i + 200), {}, m.rawAttributes);
    }
    const [[{ n }]] = await target.query(`SELECT COUNT(*) AS n FROM [${table}]`);
    const ok = Number(n) === rows.length;
    console.log(`${ok ? 'OK ' : 'LỆCH'} ${table}: SQLite ${rows.length} dòng -> SQL Server ${n} dòng`);
    if (!ok) throw new Error(`Số dòng bảng ${table} không khớp`);
  }
  await source.close();
  await target.close();
  console.log('\nHoàn tất chuyển dữ liệu sang SQL Server.');
})().catch((err) => {
  console.error('\nLỗi:', err.message);
  process.exit(1);
});
