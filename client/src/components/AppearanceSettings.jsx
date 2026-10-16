import { useState } from 'react';
import { BACKGROUNDS, getTheme, saveTheme } from '../theme';

// Chỉnh sửa giao diện: chế độ sáng / tối và ảnh nền (áp dụng ngay, lưu trên trình duyệt này)
export default function AppearanceSettings() {
  const [theme, setTheme] = useState(getTheme);
  const update = (patch) => {
    const next = { ...theme, ...patch };
    setTheme(next);
    saveTheme(next);
  };

  return (
    <div className="appearance">
      <div className="card">
        <h3>Chế độ hiển thị</h3>
        <div className="mode-options">
          {[
            { id: 'light', icon: '☀️', name: 'Sáng', hint: 'Nền sáng, chữ tối' },
            { id: 'dark', icon: '🌙', name: 'Tối', hint: 'Dịu mắt khi làm việc ban đêm' },
          ].map((m) => (
            <button
              type="button"
              key={m.id}
              className={`mode-option mode-${m.id} ${theme.mode === m.id ? 'active' : ''}`}
              onClick={() => update({ mode: m.id })}
            >
              <span className="mode-icon">{m.icon}</span>
              <strong>{m.name}</strong>
              <small>{m.hint}</small>
              {theme.mode === m.id && <span className="mode-check">✓</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Ảnh nền</h3>
        <p className="muted small">Chọn ảnh nền cho toàn bộ ứng dụng. Ảnh được phủ một lớp mờ để chữ vẫn dễ đọc.</p>
        <div className="bg-options">
          {BACKGROUNDS.map((b) => (
            <button
              type="button"
              key={b.id}
              className={`bg-option ${theme.bg === b.id ? 'active' : ''}`}
              onClick={() => update({ bg: b.id })}
              title={b.name}
            >
              <span className={`bg-thumb ${b.url ? '' : 'bg-default'}`} style={b.url ? { backgroundImage: `url("${b.url}")` } : undefined} />
              <small>{b.name}</small>
              {theme.bg === b.id && <span className="mode-check">✓</span>}
            </button>
          ))}
        </div>
      </div>
      <p className="muted small">Giao diện được lưu trên trình duyệt này; mỗi máy / mỗi trình duyệt có thể chọn khác nhau.</p>
    </div>
  );
}
