// Chạy cả TaskFlow bằng 1 lệnh (VD trong terminal của VS Code):  npm run dev   (đứng ở thư mục taskflow)
// 1) Bật máy chủ API (cổng 5050)  2) Đợi API sẵn sàng  3) Bật giao diện web (cổng 5180) → tự mở Microsoft Edge
// Bấm Ctrl + C để tắt cả hai.
const { spawn } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const children = [];

function run(name, dir, color) {
  const child = spawn('npm', ['run', 'dev'], { cwd: path.join(root, dir), shell: true, env: process.env });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => stream.on('data', (buf) => {
    buf.toString().split(/\r?\n/).filter(Boolean).forEach((line) => out.write(`${prefix}${line}\n`));
  });
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => console.log(`${prefix}đã dừng (mã ${code})`));
  children.push(child);
  return child;
}

async function waitForApi(seconds = 40) {
  for (let i = 0; i < seconds; i += 1) {
    try {
      const res = await fetch('http://127.0.0.1:5050/api/health');
      if (res.ok) return true;
    } catch { /* chưa chạy xong */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

(async () => {
  run('API', 'server', 36);
  console.log('Đang khởi động máy chủ API...');
  if (!(await waitForApi())) console.log('API khởi động chậm, vẫn mở giao diện web (xem lỗi ở dòng [API] phía trên).');
  run('WEB', 'client', 35); // giao diện chạy xong sẽ tự mở Microsoft Edge
})();

const stop = () => {
  children.forEach((c) => c.kill());
  process.exit();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
