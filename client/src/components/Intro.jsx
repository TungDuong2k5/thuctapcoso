import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const SLIDES = [
  { icon: '🗂️', title: 'Giao việc rõ ràng', text: 'Bảng Kanban, danh sách, lịch. Giao một việc cho nhiều người, đặt hạn nộp đến từng giờ.' },
  { icon: '📤', title: 'Nộp bài & nhận xét', text: 'Thành viên gửi báo cáo kèm file, trưởng nhóm nhận xét Đạt / Chưa đạt ngay trên ứng dụng.' },
  { icon: '🚨', title: 'Nhắc hạn khẩn', text: 'Tự động báo khi sắp đến hạn, quá hạn; ghi rõ bài nộp muộn bao lâu.' },
  { icon: '📊', title: 'Theo dõi hiệu suất', text: 'Tiến độ % của từng người, từng dự án, theo tuần và theo tháng.' },
  { icon: '💬', title: 'Trò chuyện & gọi nhóm', text: 'Nhắn tin, gọi video nhóm bằng mã phòng + mật khẩu do trưởng nhóm cấp.' },
  { icon: '🔔', title: 'Thông báo tức thì', text: 'Được giao việc, có bình luận, được @nhắc tên… đều báo ngay lập tức.' },
];
const SLIDE_MS = 2800;

// Giới thiệu toàn màn hình: lần lượt từng tính năng (tự lướt), cuối cùng là TaskFlow + Đăng nhập / Đăng ký
export default function Intro({ onLogin }) {
  const last = SLIDES.length; // vị trí màn cuối (logo + nút)
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const atEnd = step >= last;

  // Tự chuyển sang tính năng tiếp theo
  useEffect(() => {
    if (atEnd || paused) return undefined;
    const timer = setTimeout(() => setStep((s) => s + 1), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [step, atEnd, paused]);

  // Phím ← → để chuyển, Esc / Enter để bỏ qua
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setStep((s) => Math.min(last, s + 1));
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1));
      if ((e.key === 'Escape' || e.key === 'Enter') && step < last) setStep(last);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, last]);

  return (
    <div className="intro-full" onMouseEnter={() => setPaused(false)}>
      {!atEnd && (
        <button type="button" className="intro-skip" onClick={() => setStep(last)}>Bỏ qua intro ⏭</button>
      )}

      {!atEnd && (
        <div
          key={step}
          className="intro-slide"
          onMouseDown={() => setPaused(true)}
          onMouseUp={() => setPaused(false)}
        >
          <div className="intro-slide-icon">{SLIDES[step].icon}</div>
          <small className="intro-step">{step + 1} / {SLIDES.length}</small>
          <h2>{SLIDES[step].title}</h2>
          <p>{SLIDES[step].text}</p>
          <div className="intro-timer"><span style={{ animationDuration: `${SLIDE_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }} /></div>
        </div>
      )}

      {atEnd && (
        <div className="intro-final">
          <img src="/logo.png" alt="TaskFlow" className="intro-final-logo" />
          <h1>Quản lý và báo cáo công việc nhóm</h1>
          <h2>gọn gàng, minh bạch, đúng hạn</h2>
          <div className="intro-actions">
            <button type="button" className="btn primary intro-btn" onClick={onLogin}>Đăng nhập</button>
            <Link to="/register" className="btn intro-btn ghost-light">Đăng ký</Link>
          </div>
          <button type="button" className="link intro-replay" onClick={() => setStep(0)}>↺ Xem lại giới thiệu</button>
        </div>
      )}

      <div className="intro-dots">
        {[...SLIDES, null].map((s, i) => (
          <button
            type="button"
            key={s ? s.title : 'end'}
            className={`intro-dot ${i === step ? 'active' : ''} ${i < step ? 'seen' : ''}`}
            title={s ? s.title : 'Đăng nhập'}
            onClick={() => setStep(i)}
          />
        ))}
      </div>
    </div>
  );
}
