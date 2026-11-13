// Bật gửi mail thật: hỏi Gmail + mật khẩu ứng dụng, gửi thử 1 mail cho chính bạn, đúng thì ghi vào server/.env
// Chạy: bấm đúp cau-hinh-mail.bat ở thư mục taskflow
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');
const nodemailer = require('nodemailer');

const ENV_PATH = path.resolve(__dirname, '../.env');
const ENV_EXAMPLE = path.resolve(__dirname, '../.env.example');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(`${question}: `, (a) => { rl.close(); resolve(a.trim()); }));
}

// Mã ứng dụng chỉ gồm chữ cái; bỏ dấu cách và ký tự lạ lẫn vào khi dán
const onlyLetters = (text) => String(text).replace(/\x1b\[[0-9;~]*/g, '').replace(/[^a-zA-Z]/g, '');

function readClipboard() {
  try {
    return execSync('powershell -NoProfile -Command Get-Clipboard', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

// Nhập mã: hiện dấu * thay cho chữ và đếm số ký tự; Ctrl+V hoặc chuột phải để dán
function askCode(question) {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) return ask(question).then(onlyLetters);
  return new Promise((resolve) => {
    let value = '';
    const draw = () => stdout.write(`\r\x1b[K${question}: ${'*'.repeat(value.length)} (${value.length}/16)`);
    draw();
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk) => {
      if (chunk === '\u0003') process.exit(1);
      if (chunk === '\u0016') {
        value += onlyLetters(readClipboard());
      } else if (chunk === '\u0008' || chunk === '\u007f') {
        value = value.slice(0, -1);
      } else {
        const end = chunk.search(/[\r\n]/);
        value += onlyLetters(end === -1 ? chunk : chunk.slice(0, end));
        // Dán nhiều dòng: chỉ coi là Enter khi người dùng bấm riêng phím Enter hoặc đã đủ ký tự
        if (end !== -1 && (chunk.length === 1 || value.length >= 16)) {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          stdout.write('\n');
          resolve(value);
          return;
        }
      }
      draw();
    };
    stdin.on('data', onData);
  });
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
  console.log('\n=== Bật gửi mail thật cho TaskFlow (qua Gmail) ===\n');
  console.log('Cần MẬT KHẨU ỨNG DỤNG 16 ký tự, KHÔNG dùng mật khẩu Gmail bình thường.');
  console.log('Cách tạo: bật Xác minh 2 bước, rồi vào https://myaccount.google.com/apppasswords\n');
  const user = (await ask('Địa chỉ Gmail dùng để gửi')).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user)) {
    console.log('\nX Email không đúng định dạng.');
    process.exit(1);
  }
  console.log('Dán mã bằng Ctrl+V hoặc chuột phải, rồi bấm Enter.\n');
  let pass = '';
  for (let lan = 1; lan <= 5 && pass.length !== 16; lan += 1) {
    pass = await askCode('Mật khẩu ứng dụng');
    if (pass.length !== 16) console.log(`X Mới có ${pass.length} ký tự, cần đủ 16 chữ cái. Nhập lại nhé.\n`);
  }
  if (pass.length !== 16) process.exit(1);

  // Chỉ hiện 2 chữ đầu + 2 chữ cuối để tự so với mã trên trang Google
  console.log(`\nEmail: ${user}`);
  console.log(`Mã đã nhận: ${pass.slice(0, 2)}...${pass.slice(-2)} (so với mã đang hiện trên trang Google)`);
  await ask('Đúng thì bấm Enter để gửi thử (sai thì đóng cửa sổ này)');
  console.log('\nĐang gửi thử 1 mail cho chính bạn...');
  try {
    const transport = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass }, connectionTimeout: 15000,
    });
    await transport.sendMail({
      from: `TaskFlow <${user}>`, to: user, subject: 'TaskFlow: đã bật gửi mail', text: 'Mail thử từ TaskFlow. Nhận được mail này là cấu hình đúng.',
    });
  } catch (err) {
    console.log(`\nX Không gửi được: ${err.message}`);
    console.log('Chưa lưu gì. Kiểm tra lại Gmail và mật khẩu ứng dụng rồi chạy lại.');
    process.exit(1);
  }
  updateEnv({ SMTP_USER: user, SMTP_PASS: pass });
  console.log('\nV Gửi thử thành công, đã lưu vào server/.env (file này không đưa lên GitHub).');
  console.log('>>> Hãy KHỞI ĐỘNG LẠI server (tắt 2 cửa sổ TaskFlow rồi mở lại) để bắt đầu gửi mail mời. <<<\n');
}

main();
