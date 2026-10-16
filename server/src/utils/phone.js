// Chuẩn hóa số điện thoại Việt Nam (thông tin liên lạc trong hồ sơ) về dạng 0xxxxxxxxx.
// "0912 345 678", "0912.345.678", "+84912345678", "84912345678" → "0912345678"
function normalizePhone(value) {
  let s = String(value || '').replace(/[\s.\-()]/g, '');
  if (s.startsWith('+84')) s = `0${s.slice(3)}`;
  else if (/^84\d{9,10}$/.test(s)) s = `0${s.slice(2)}`;
  return /^0\d{9,10}$/.test(s) ? s : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = { normalizePhone, EMAIL_RE };
