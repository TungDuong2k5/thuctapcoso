require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const http = require('http');
const app = require('./app');
const { sequelize } = require('./models');
const { initSocket } = require('./sockets');
const { ensureSchema } = require('./config/schema');
const { startDeadlineScheduler } = require('./services/deadlines');

const PORT = process.env.PORT || 5050;

// Khi chạy bằng Docker, MySQL có thể khởi động chậm hơn API nên thử kết nối lại vài lần
async function connectWithRetry(retries = 10) {
  for (let i = 1; i <= retries; i += 1) {
    try {
      await sequelize.authenticate();
      return;
    } catch (err) {
      console.log(`Chưa kết nối được CSDL (lần ${i}/${retries}): ${err.message}`);
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

async function start() {
  if ((process.env.DB_DIALECT || 'sqlite') === 'sqlite') {
    fs.mkdirSync(path.resolve(__dirname, '../data'), { recursive: true });
  }
  await connectWithRetry();
  await ensureSchema();

  const server = http.createServer(app);
  initSocket(server);
  server.listen(PORT, () => console.log(`TaskFlow API chạy tại http://localhost:${PORT}`));
  startDeadlineScheduler(); // kiểm tra hạn ngay khi chạy và mỗi 30 phút
}

start().catch((err) => {
  console.error('Không khởi động được server:', err);
  process.exit(1);
});
