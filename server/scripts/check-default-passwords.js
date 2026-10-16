// Cảnh báo tài khoản còn dùng mật khẩu mặc định 123456 (của dữ liệu mẫu) trước khi mở web ra Internet
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const { sequelize, User } = require('../src/models');

(async () => {
  const users = await User.findAll({ where: { isActive: true } });
  const weak = [];
  for (const u of users) {
    if (u.passwordHash && await bcrypt.compare('123456', u.passwordHash)) weak.push(u);
  }
  await sequelize.close();
  if (!weak.length) {
    console.log('OK: khong co tai khoan nao dung mat khau mac dinh 123456.');
    return;
  }
  console.log('');
  console.log('!!! CANH BAO BAO MAT: cac tai khoan sau van dung mat khau 123456:');
  weak.forEach((u) => console.log(`    - ${u.email}${u.systemRole === 'admin' ? '  (QUAN TRI VIEN)' : ''}`));
  console.log('    Khi web mo ra Internet, ai cung co the dang nhap bang cac tai khoan nay.');
  console.log('    Hay dang nhap tung tai khoan -> Ho so -> Doi mat khau (hoac admin khoa tai khoan khong dung).');
  console.log('');
  process.exitCode = 2;
})().catch((err) => {
  console.error('Khong kiem tra duoc mat khau:', err.message);
});
