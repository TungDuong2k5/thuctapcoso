const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { signToken } = require('../middlewares/auth');
const { HttpError } = require('../utils/http');
const { Op } = require('sequelize');
const { acceptPendingByEmail } = require('../services/membership');
const crypto = require('crypto');
const { hashToken } = require('../services/passwordReset');
const google = require('../services/googleAuth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function register(req, res) {
  const { fullName, email, password } = req.body;
  if (!fullName?.trim()) throw new HttpError(400, 'Vui lòng nhập họ tên');
  if (!EMAIL_RE.test(email || '')) throw new HttpError(400, 'Email không hợp lệ');
  if ((password || '').length < 6) throw new HttpError(400, 'Mật khẩu tối thiểu 6 ký tự');
  if (await User.findOne({ where: { email: email.toLowerCase() } })) throw new HttpError(400, 'Email đã được sử dụng');

  const user = await User.create({
    fullName: fullName.trim(),
    email: email.toLowerCase(),
    passwordHash: await bcrypt.hash(password, 10),
  });
  // Ai đã được mời bằng email này thì tự vào các dự án đó
  const joinedProjects = await acceptPendingByEmail(user);
  res.status(201).json({ token: signToken(user), user, joinedProjects });
}

async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ where: { email: (email || '').toLowerCase() } });
  if (user && user.hasPassword === false) {
    throw new HttpError(400, 'Tài khoản này đăng nhập bằng Google. Hãy bấm "Đăng nhập bằng Google" (hoặc đặt mật khẩu trong Hồ sơ).');
  }
  if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) {
    throw new HttpError(400, 'Email hoặc mật khẩu không đúng');
  }
  if (!user.isActive) throw new HttpError(403, 'Tài khoản đã bị khóa');
  res.json({ token: signToken(user), user });
}

async function me(req, res) {
  res.json(req.user);
}

const PROFILE_FIELDS = {
  studentCode: { max: 20, label: 'MSSV' },
  className: { max: 50, label: 'Lớp' },
  phone: { max: 15, label: 'Số điện thoại', pattern: /^\+?[0-9 .-]{9,15}$/ },
  bio: { max: 500, label: 'Giới thiệu' },
};

async function updateMe(req, res) {
  const {
    fullName, currentPassword, newPassword, dateOfBirth,
  } = req.body;
  if (fullName !== undefined) {
    if (!fullName.trim()) throw new HttpError(400, 'Họ tên không được để trống');
    req.user.fullName = fullName.trim().slice(0, 100);
  }
  for (const [key, rule] of Object.entries(PROFILE_FIELDS)) {
    if (req.body[key] === undefined) continue;
    const value = String(req.body[key] ?? '').trim();
    if (value.length > rule.max) throw new HttpError(400, `${rule.label} tối đa ${rule.max} ký tự`);
    if (value && rule.pattern && !rule.pattern.test(value)) throw new HttpError(400, `${rule.label} không hợp lệ`);
    req.user[key] = value || null;
  }
  if (dateOfBirth !== undefined) {
    if (dateOfBirth && (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || dateOfBirth > new Date().toISOString().slice(0, 10))) {
      throw new HttpError(400, 'Ngày sinh không hợp lệ');
    }
    req.user.dateOfBirth = dateOfBirth || null;
  }
  if (newPassword) {
    // Tài khoản tạo bằng Google chưa có mật khẩu → đặt lần đầu không cần mật khẩu cũ
    if (req.user.hasPassword !== false && !(await bcrypt.compare(currentPassword || '', req.user.passwordHash))) {
      throw new HttpError(400, 'Mật khẩu hiện tại không đúng');
    }
    if (newPassword.length < 6) throw new HttpError(400, 'Mật khẩu mới tối thiểu 6 ký tự');
    if (req.body.confirmPassword !== undefined && req.body.confirmPassword !== newPassword) {
      throw new HttpError(400, 'Mật khẩu nhập lại không khớp');
    }
    req.user.passwordHash = await bcrypt.hash(newPassword, 10);
    req.user.hasPassword = true;
    req.user.passwordChangedAt = new Date();
  }
  await req.user.save();
  // Đổi mật khẩu làm các phiên cũ hết hiệu lực → cấp token mới cho phiên hiện tại
  res.json(newPassword ? { ...req.user.toJSON(), newToken: signToken(req.user) } : req.user);
}

// Đăng nhập bằng Google: trình duyệt gửi "credential" (ID token Google cấp),
// server kiểm tra chữ ký với Google rồi đăng nhập / tạo tài khoản theo email Gmail.
async function googleLogin(req, res) {
  if (!process.env.GOOGLE_CLIENT_ID) throw new HttpError(400, 'Chưa cấu hình đăng nhập Google');
  const profile = await google.verifyCredential(req.body.credential);
  if (!profile?.email || !profile.email_verified) throw new HttpError(400, 'Không xác thực được tài khoản Google');

  const email = profile.email.toLowerCase();
  let user = await User.findOne({ where: { email } });
  let created = false;
  if (user) {
    if (!user.isActive) throw new HttpError(403, 'Tài khoản đã bị khóa');
    if (!user.googleId) {
      user.googleId = profile.sub; // tài khoản cũ (đăng ký bằng mật khẩu) nay liên kết thêm Google
      await user.save();
    }
  } else {
    // Lần đầu đăng nhập bằng Google → tự tạo tài khoản, chưa có mật khẩu riêng
    user = await User.create({
      fullName: (profile.name || email.split('@')[0]).slice(0, 100),
      email,
      googleId: profile.sub,
      hasPassword: false,
      passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
    });
    created = true;
  }
  // Ai đã được mời bằng email này thì tự vào các dự án đó
  const joinedProjects = created ? await acceptPendingByEmail(user) : 0;
  res.status(created ? 201 : 200).json({ token: signToken(user), user, joinedProjects });
}

// Cho giao diện biết có bật đăng nhập Google không (Client ID là thông tin công khai)
function authConfig(req, res) {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null });
}

async function findUserByResetToken(token) {
  if (!token || typeof token !== 'string') return null;
  return User.findOne({
    where: { resetTokenHash: hashToken(token), resetTokenExpires: { [Op.gt]: new Date() }, isActive: true },
  });
}

// Link đặt lại mật khẩu do admin tạo hộ: kiểm tra còn hiệu lực không
async function checkResetToken(req, res) {
  const user = await findUserByResetToken(req.query.token);
  if (!user) throw new HttpError(400, 'Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');
  res.json({ email: user.email });
}

// Mở link admin gửi: nhập mật khẩu mới + nhập lại để xác nhận
async function resetPassword(req, res) {
  const { token, password, confirmPassword } = req.body;
  if ((password || '').length < 6) throw new HttpError(400, 'Mật khẩu mới tối thiểu 6 ký tự');
  if (password !== confirmPassword) throw new HttpError(400, 'Mật khẩu nhập lại không khớp');
  const user = await findUserByResetToken(token);
  if (!user) throw new HttpError(400, 'Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');

  user.passwordHash = await bcrypt.hash(password, 10);
  user.hasPassword = true;
  user.passwordChangedAt = new Date(); // đăng xuất mọi phiên cũ
  user.resetTokenHash = null; // link chỉ dùng 1 lần
  user.resetTokenExpires = null;
  await user.save();
  res.json({ message: 'Đổi mật khẩu thành công. Hãy đăng nhập bằng mật khẩu mới.' });
}

module.exports = {
  register, login, googleLogin, authConfig, me, updateMe, checkResetToken, resetPassword,
};
