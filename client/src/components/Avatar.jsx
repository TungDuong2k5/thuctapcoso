// Ảnh đại diện dạng chữ cái đầu, màu cố định theo tên
const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

export function initials(name = '') {
  const parts = name.trim().split(/\s+/);
  const last = parts.at(-1) || '';
  const first = parts.length > 1 ? parts[0] : '';
  return `${first[0] || ''}${last[0] || ''}`.toUpperCase() || '?';
}

export default function Avatar({ name, size = 40 }) {
  const code = [...(name || '')].reduce((sum, c) => sum + c.charCodeAt(0), 0);
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
