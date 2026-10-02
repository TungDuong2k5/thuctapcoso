const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { HttpError } = require('../utils/http');

const UPLOAD_DIR = path.resolve(__dirname, '../..', process.env.UPLOAD_DIR || 'uploads');
const MAX_SIZE_MB = 25;
const MAX_FILES = 10;

// Cho phép hầu hết định dạng (Word, PDF, Excel, PowerPoint, ảnh, zip/rar, code...),
// chỉ chặn file chạy được trên Windows để tránh phát tán mã độc trong nhóm
const BLOCKED_EXT = ['.exe', '.msi', '.bat', '.cmd', '.com', '.scr', '.ps1', '.vbs', '.jar', '.dll', '.lnk'];

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Trình duyệt gửi tên file tiếng Việt dạng UTF-8 nhưng multer đọc thành latin1
const fixName = (name) => ([...name].some((c) => c.charCodeAt(0) > 255)
  ? name
  : Buffer.from(name, 'latin1').toString('utf8'));

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    // originalname đã được sửa tiếng Việt ở fileFilter (chạy trước bước này)
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 15);
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024, files: MAX_FILES },
  fileFilter: (req, file, cb) => {
    file.originalname = fixName(file.originalname);
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXT.includes(ext)) return cb(new HttpError(400, `Không cho phép tải lên file ${ext}`));
    cb(null, true);
  },
});

function uploadFiles(req, res, next) {
  upload.array('files', MAX_FILES)(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return next(new HttpError(400, `Mỗi file tối đa ${MAX_SIZE_MB}MB`));
    if (err?.code === 'LIMIT_FILE_COUNT' || err?.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(new HttpError(400, `Mỗi lần tối đa ${MAX_FILES} file`));
    }
    next(err);
  });
}

function removeStoredFile(storedName) {
  fs.rm(path.join(UPLOAD_DIR, storedName), { force: true }, () => {});
}

module.exports = { uploadFiles, removeStoredFile, UPLOAD_DIR };
