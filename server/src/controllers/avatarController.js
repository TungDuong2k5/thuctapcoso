const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { UPLOAD_DIR } = require('../middlewares/upload');
const { HttpError } = require('../utils/http');

const AVATAR_DIR = path.join(UPLOAD_DIR, 'avatars');
const MAX_MB = 2;
const TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: AVATAR_DIR,
    filename: (req, file, cb) => cb(null, `${req.user.id}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${TYPES[file.mimetype]}`),
  }),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => (TYPES[file.mimetype]
    ? cb(null, true)
    : cb(new HttpError(400, 'Chỉ nhận ảnh JPG, PNG, WEBP hoặc GIF'))),
});

function receiveAvatar(req, res, next) {
  upload.single('avatar')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return next(new HttpError(400, `Ảnh tối đa ${MAX_MB}MB`));
    next(err);
  });
}

function removeOld(url) {
  if (!url?.startsWith('/api/avatars/')) return;
  fs.rm(path.join(AVATAR_DIR, path.basename(url)), { force: true }, () => {});
}

async function setAvatar(req, res) {
  if (!req.file) throw new HttpError(400, 'Vui lòng chọn ảnh');
  const old = req.user.avatarUrl;
  req.user.avatarUrl = `/api/avatars/${req.file.filename}`;
  await req.user.save();
  removeOld(old);
  res.json(req.user);
}

async function removeAvatar(req, res) {
  removeOld(req.user.avatarUrl);
  req.user.avatarUrl = null;
  await req.user.save();
  res.json(req.user);
}

module.exports = {
  receiveAvatar, setAvatar, removeAvatar, AVATAR_DIR,
};
