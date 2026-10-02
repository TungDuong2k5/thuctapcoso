import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';

// Chọn nhiều người làm cho một công việc: bấm để mở danh sách thành viên, tick chọn từng người
export default function AssigneePicker({ members, value, onChange, placeholder = 'Chưa giao' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Bấm ra ngoài thì đóng danh sách
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const selected = members.filter((m) => value.includes(m.id));
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div className="picker" ref={ref}>
      <button type="button" className="picker-button" onClick={() => setOpen(!open)}>
        {selected.length === 0 && <span className="muted">{placeholder}</span>}
        {selected.length > 0 && (
          <span className="picker-chips">
            {selected.map((m) => <span key={m.id} className="chip">{m.fullName}</span>)}
          </span>
        )}
        <span className="picker-caret">▾</span>
      </button>
      {open && (
        <div className="picker-menu">
          {members.map((m) => (
            <label key={m.id} className="picker-option">
              <input type="checkbox" checked={value.includes(m.id)} onChange={() => toggle(m.id)} />
              <Avatar name={m.fullName} size={24} />
              <span className="grow">{m.fullName}</span>
              {m.role === 'leader' && <small className="muted">Trưởng nhóm</small>}
            </label>
          ))}
          <div className="picker-foot">
            <button type="button" className="link" onClick={() => onChange([])}>Bỏ chọn hết</button>
            <button type="button" className="btn primary" onClick={() => setOpen(false)}>Xong ({value.length})</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Tên người làm hiển thị gọn: "An, Bình" hoặc "An, Bình +2"
export function assigneeNames(task, max = 2) {
  const names = (task.assignees || []).map((u) => u.fullName);
  if (!names.length) return 'Chưa giao';
  return names.length > max ? `${names.slice(0, max).join(', ')} +${names.length - max}` : names.join(', ');
}
