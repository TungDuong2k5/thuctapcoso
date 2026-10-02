const { User } = require('../models');
const { HttpError } = require('../utils/http');
const { RESET_MINUTES, createResetLink } = require('../services/passwordReset');

async function listUsers(req, res) {
  res.json(await User.findAll({ order: [['id', 'ASC']] }));
}

async function updateUser(req, res) {
  const user = await User.findByPk(req.params.id);
  if (!user) throw new HttpError(404, 'Không tìm thấy người dùng');
  if (user.id === req.user.id) throw new HttpError(400, 'Không thể tự đổi quyền hoặc khóa chính mình');

  const { systemRole, isActive } = req.body;
  if (systemRole !== undefined) {
    if (!['admin', 'user'].includes(systemRole)) throw new HttpError(400, 'Vai trò không hợp lệ');
    user.systemRole = systemRole;
  }
  if (isActive !== undefined) user.isActive = Boolean(isActive);
  await user.save();
  res.json(user);
}

// Khi chưa cấu hình gửi email: admin tạo link đặt lại mật khẩu rồi gửi cho người dùng (Zalo, Messenger...)
async function resetLink(req, res) {
  const user = await User.findByPk(req.params.id);
  if (!user) throw new HttpError(404, 'Không tìm thấy người dùng');
  const link = await createResetLink(user);
  res.json({ link, expiresInMinutes: RESET_MINUTES });
}

module.exports = { listUsers, updateUser, resetLink };
