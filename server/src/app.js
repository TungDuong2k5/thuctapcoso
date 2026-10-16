const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
// Ảnh đại diện: công khai (thẻ <img> không gửi token), tên file ngẫu nhiên
app.use('/api/avatars', express.static(require('./controllers/avatarController').AVATAR_DIR, { maxAge: '7d' }));
app.use('/api', routes);

// Có bản build giao diện (client/dist) → phục vụ luôn tại cổng API.
// Nhờ vậy khi chia sẻ online chỉ cần mở đường hầm tới 1 cổng (5050) là dùng được cả web lẫn API.
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) {
  app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/|socket\.io\/).*/, (req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
