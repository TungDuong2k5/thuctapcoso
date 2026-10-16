import { useRef, useState } from 'react';
import Avatar from './Avatar';

// Ô bình luận có @nhắc tên: gõ "@" sẽ hiện danh sách thành viên để chọn
export default function MentionInput({
  members, value, onChange, onMention, placeholder,
}) {
  const [query, setQuery] = useState(null); // chữ sau "@" đang gõ, null = không gợi ý
  const [active, setActive] = useState(0);
  const input = useRef(null);

  const matches = query === null ? [] : members
    .filter((m) => m.fullName.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 6);

  const update = (text, caret) => {
    onChange(text);
    const before = text.slice(0, caret);
    const at = before.lastIndexOf('@');
    // Có "@" ở đầu hoặc sau khoảng trắng và chưa xuống dòng → đang nhắc tên
    if (at >= 0 && (at === 0 || /\s/.test(before[at - 1])) && !/\n/.test(before.slice(at)) && before.length - at <= 30) {
      setQuery(before.slice(at + 1));
      setActive(0);
    } else {
      setQuery(null);
    }
  };

  const pick = (m) => {
    const el = input.current;
    const caret = el.selectionStart;
    const at = value.slice(0, caret).lastIndexOf('@');
    const text = `${value.slice(0, at)}@${m.fullName} ${value.slice(caret)}`;
    onChange(text);
    onMention(m);
    setQuery(null);
    requestAnimationFrame(() => {
      const pos = at + m.fullName.length + 2;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e) => {
    if (!matches.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((active + 1) % matches.length); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((active - 1 + matches.length) % matches.length); }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(matches[active]); }
    if (e.key === 'Escape') setQuery(null);
  };

  return (
    <div className="mention-box grow">
      <input
        ref={input}
        className="full"
        placeholder={placeholder}
        value={value}
        onChange={(e) => update(e.target.value, e.target.selectionStart)}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
      />
      {matches.length > 0 && (
        <div className="mention-menu">
          {matches.map((m, i) => (
            <button type="button" key={m.id} className={i === active ? 'active' : ''} onMouseDown={(e) => { e.preventDefault(); pick(m); }}>
              <Avatar name={m.fullName} src={m.avatarUrl} size={22} />
              <span>{m.fullName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Tô đậm các @tên trong nội dung bình luận
export function renderMentions(content, members) {
  const names = members.map((m) => m.fullName).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!names.length) return content;
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = content.split(new RegExp(`(@(?:${escaped.join('|')}))`, 'g'));
  return parts.map((p, i) => (i % 2 ? <span key={i} className="mention">{p}</span> : p));
}
