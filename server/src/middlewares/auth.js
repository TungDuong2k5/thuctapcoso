const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { HttpError, asyncHandler } = require('../utils/http');

const secret = () => process.env.JWT_SECRET || 'dev-secret';

function signToken(user) {
  return jwt.sign({ id: user.id }, secret(), { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}

async function userFromToken(token) {
  const payload = jwt.verify(token, secret());
  const user = await User.findByPk(payload.id);
  if (!user || !user.isActive) throw new HttpError(401, 'Tài khoản không tồn tại hoặc đã bị khóa');
  // Đổi mật khẩu xong thì các phiên đăng nhập cũ hết hiệu lực
  if (user.passwordChangedAt && payload.iat * 1000 < user.passwordChangedAt.getTime() - 1000) {
    throw new HttpError(401, 'Mật khẩu đã được đổi, vui lòng đăng nhập lại');
  }
  return user;
}

const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Bạn chưa đăng nhập');
  try {
    req.user = await userFromToken(token);
  } catch (err) {
    throw err instanceof HttpError ? err : new HttpError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
  }
  next();
});

function requireAdmin(req, res, next) {
  if (req.user?.systemRole !== 'admin') return next(new HttpError(403, 'Chỉ quản trị viên được thực hiện'));
  next();
}

module.exports = { signToken, userFromToken, requireAuth, requireAdmin };
