const nodemailer = require('nodemailer');

// Gửi mail thật qua SMTP (mặc định Gmail). Cấu hình trong server/.env bằng cau-hinh-mail.bat:
// SMTP_USER = địa chỉ Gmail, SMTP_PASS = mật khẩu ứng dụng 16 ký tự (không phải mật khẩu Gmail)
const isConfigured = () => process.env.NODE_ENV !== 'test' && Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: (Number(process.env.SMTP_PORT) || 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// Địa chỉ đặt trong mail: lấy theo trang người mời đang mở (link https khi chia sẻ online),
// chỉ tin các địa chỉ đã biết để không ai chèn được trang lạ vào mail
function publicUrl(req) {
  const appUrl = (process.env.APP_URL || 'http://localhost:5180').replace(/\/$/, '');
  const origin = req.get('origin');
  if (!origin) return appUrl;
  try {
    const { protocol, hostname } = new URL(origin);
    const local = ['localhost', '127.0.0.1'].includes(hostname);
    const tunnel = protocol === 'https:' && hostname.endsWith('.trycloudflare.com');
    return local || tunnel || origin === appUrl ? origin : appUrl;
  } catch {
    return appUrl;
  }
}

// Trả về 'sent' | 'failed' | 'off'. Lỗi gửi mail không làm hỏng lời mời (vẫn còn trong app và link).
async function sendInviteMail({
  to, inviterName, projectName, roleLabel, link,
}) {
  if (!isConfigured()) return 'off';
  const project = escapeHtml(projectName);
  const inviter = escapeHtml(inviterName);
  try {
    await createTransport().sendMail({
      from: process.env.MAIL_FROM || `TaskFlow <${process.env.SMTP_USER}>`,
      to,
      subject: `${inviterName} mời bạn tham gia dự án "${projectName}" trên TaskFlow`,
      text: `${inviterName} mời bạn tham gia dự án "${projectName}" với vai trò ${roleLabel}.\n\nMở link để tham gia: ${link}\n\nĐăng nhập hoặc đăng ký bằng đúng email này (${to}).`,
      html: `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;color:#1f2937">
  <h2 style="color:#1e3a8a">TaskFlow</h2>
  <p><strong>${inviter}</strong> mời bạn tham gia dự án <strong>${project}</strong> với vai trò ${escapeHtml(roleLabel)}.</p>
  <p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#2563eb;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Xem lời mời</a></p>
  <p style="font-size:13px;color:#6b7280">Hãy đăng nhập hoặc đăng ký bằng đúng email này (${escapeHtml(to)}). Nếu nút không bấm được, mở link: ${escapeHtml(link)}</p>
</div>`,
    });
    return 'sent';
  } catch (err) {
    console.error('Không gửi được mail mời:', err.message);
    return 'failed';
  }
}

// Email nhắc hạn: còn dưới 1 ngày (khẩn) hoặc đã quá hạn mà chưa nộp. Trả về 'sent' | 'failed' | 'off'.
async function sendDeadlineMail({
  to, name, taskTitle, projectName, deadlineText, overdue, link,
}) {
  if (!isConfigured()) return 'off';
  const heading = overdue ? 'Công việc đã QUÁ HẠN' : 'Công việc sắp hết hạn (còn dưới 1 ngày)';
  const note = overdue
    ? 'Bạn vẫn nộp được nhưng bài sẽ bị ghi Nộp muộn. Hãy nộp càng sớm càng tốt.'
    : 'Bạn chưa gửi báo cáo cho công việc này. Hãy nộp trước hạn nhé.';
  try {
    await createTransport().sendMail({
      from: process.env.MAIL_FROM || `TaskFlow <${process.env.SMTP_USER}>`,
      to,
      subject: `${overdue ? '[QUÁ HẠN]' : '[SẮP HẾT HẠN]'} "${taskTitle}" – ${projectName}`,
      text: `Chào ${name},\n\n${heading}: "${taskTitle}" (dự án ${projectName}), hạn nộp ${deadlineText}.\n${note}\n\nMở công việc: ${link}`,
      html: `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;color:#1f2937">
  <h2 style="color:${overdue ? '#b91c1c' : '#b45309'}">${heading}</h2>
  <p>Chào <strong>${escapeHtml(name)}</strong>,</p>
  <p>Công việc <strong>${escapeHtml(taskTitle)}</strong> trong dự án <strong>${escapeHtml(projectName)}</strong> có hạn nộp <strong>${escapeHtml(deadlineText)}</strong>.</p>
  <p>${note}</p>
  <p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#2563eb;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Mở công việc</a></p>
</div>`,
    });
    return 'sent';
  } catch (err) {
    console.error('Không gửi được mail nhắc hạn:', err.message);
    return 'failed';
  }
}

module.exports = {
  isConfigured, createTransport, publicUrl, sendInviteMail, sendDeadlineMail,
};
