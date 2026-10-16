import { useEffect, useRef, useState } from 'react';

// Hiển thị các nhãn của công việc dạng chip màu
export function LabelChips({ labels, small = true }) {
  if (!labels?.length) return null;
  return (
    <div className="label-chips">
      {labels.map((l) => (
        <span key={l.id} className={`label-chip ${small ? 'sm' : ''}`} style={{ background: l.color }}>{l.name}</span>
      ))}
    </div>
  );
}

// Chọn nhiều nhãn cho một công việc (danh sách thả xuống có ô tick)
export default function LabelPicker({ labels, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const selected = labels.filter((l) => value.includes(l.id));
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div className="picker" ref={ref}>
      <button type="button" className="picker-button" onClick={() => setOpen(!open)}>
        {selected.length === 0 ? <span className="muted">Nhãn...</span> : <LabelChips labels={selected} />}
        <span className="picker-caret">▾</span>
      </button>
      {open && (
        <div className="picker-menu">
          {labels.length === 0 && <p className="muted small" style={{ padding: 8 }}>Dự án chưa có nhãn (trưởng nhóm thêm ở tab Cài đặt)</p>}
          {labels.map((l) => (
            <label key={l.id} className="picker-option">
              <input type="checkbox" checked={value.includes(l.id)} onChange={() => toggle(l.id)} />
              <span className="label-chip" style={{ background: l.color }}>{l.name}</span>
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
