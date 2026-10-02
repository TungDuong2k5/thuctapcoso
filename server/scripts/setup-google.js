// Bật nút "Đăng nhập bằng Google": hỏi Google Client ID rồi ghi vào server/.env
// Chạy: npm run setup-google   (hoặc bấm đúp cau-hinh-google.bat ở thư mục taskflow)
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ENV_PATH = path.resolve(__dirname, '../.env');
const ENV_EXAMPLE = path.resolve(__dirname, '../.env.example');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(`${question}: `, (a) => { rl.close(); resolve(a.trim()); }));
}

// Cập nhật (hoặc thêm) khóa trong .env, giữ nguyên các dòng khác
function updateEnv(values) {
  if (!fs.existsSync(ENV_PATH)) fs.copyFileSync(ENV_EXAMPLE, ENV_PATH);
  const pending = { ...values };
  const out = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/).map((line) => {
    const key = line.split('=')[0].trim();
    if (!(key in pending)) return line;
    const v = pending[key];
    delete pending[key];
    return `${key}=${v}`;
  });
  Object.entries(pending).forEach(([k, v]) => out.push(`${k}=${v}`));
  fs.writeFileSync(ENV_PATH, out.join('\n'));
}

async function main() {
  console.log('\n=== Bật đăng nhập bằng Google cho TaskFlow ===\n');
  console.log('Client ID có dạng: 1234567890-abc...xyz.apps.googleusercontent.com');
  console.log('(Cách tạo: xem mục "Đăng nhập bằng Google" trong README.md)\n');
  const clientId = await ask('Dán Google Client ID');
  if (!/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(clientId)) {
    console.log('\nX Client ID không đúng định dạng (phải kết thúc bằng .apps.googleusercontent.com).');
    process.exit(1);
  }
  updateEnv({ GOOGLE_CLIENT_ID: clientId });
  console.log('\nV Đã lưu vào server/.env');
  console.log('>>> Hãy KHỞI ĐỘNG LẠI server (tắt rồi mở lại chay-du-an.bat) để hiện nút "Đăng nhập bằng Google". <<<\n');
}

main();
