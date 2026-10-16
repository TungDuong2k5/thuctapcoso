// Ảnh đại diện: ảnh đã tải lên, chưa có thì hiện chữ cái đầu với màu cố định theo tên
const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

export function initials(name = '') {
  // Bỏ phần ghi chú trong ngoặc, VD "Nguyễn Văn An (bạn)" → NA
  const parts = name.replace(/\(.*?\)/g, '').trim().split(/\s+/);
  const last = parts.at(-1) || '';
  const first = parts.length > 1 ? parts[0] : '';
  return `${first[0] || ''}${last[0] || ''}`.toUpperCase() || '?';
}

export default function Avatar({ name, src, size = 40 }) {
  if (src) {
    return <img className="avatar" src={src} alt={name} title={name} style={{ width: size, height: size, objectFit: 'cover' }} />;
  }
  // Màu tính theo tên (bỏ phần trong ngoặc như "(bạn)") để một người luôn cùng một màu
  const code = [...(name || '').replace(/\(.*?\)/g, '').trim()].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.38, background: COLORS[code % COLORS.length] }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}
