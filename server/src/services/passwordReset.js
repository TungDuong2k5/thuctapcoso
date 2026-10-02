const crypto = require('crypto');

const RESET_MINUTES = 15;

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Link đặt lại mật khẩu do admin tạo hộ người dùng (lưu mã băm, hết hạn sau 15 phút, dùng 1 lần)
async function createResetLink(user) {
  const token = crypto.randomBytes(32).toString('hex');
  user.resetTokenHash = hashToken(token);
  user.resetTokenExpires = new Date(Date.now() + RESET_MINUTES * 60 * 1000);
  await user.save();
  const appUrl = (process.env.APP_URL || 'http://localhost:5180').replace(/\/$/, '');
  return `${appUrl}/reset-password?token=${token}`;
}

module.exports = { RESET_MINUTES, hashToken, createResetLink };
