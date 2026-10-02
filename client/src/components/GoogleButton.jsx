import { useEffect, useRef, useState } from 'react';
import api from '../api/client';

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let s = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (!s) {
      s = document.createElement('script');
      s.src = SCRIPT_SRC;
      s.async = true;
      document.head.appendChild(s);
    }
    s.addEventListener('load', resolve);
    s.addEventListener('error', reject);
  });
}

// Nút "Đăng nhập bằng Google". Chỉ hiện khi server đã cấu hình GOOGLE_CLIENT_ID.
// onCredential nhận ID token Google cấp → gửi lên server để đăng nhập.
export default function GoogleButton({ onCredential, text = 'signin_with' }) {
  const ref = useRef(null);
  const [clientId, setClientId] = useState(null);
  const [failed, setFailed] = useState(false);
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential; // luôn gọi hàm mới nhất mà không phải vẽ lại nút

  useEffect(() => {
    api.get('/auth/config').then((res) => setClientId(res.data.googleClientId)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!clientId) return;
    loadGoogleScript()
      .then(() => {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp) => callbackRef.current(resp.credential),
        });
        window.google.accounts.id.renderButton(ref.current, {
          theme: 'outline', size: 'large', width: 316, text, locale: 'vi', shape: 'rectangular',
        });
      })
      .catch(() => setFailed(true));
  }, [clientId, text]);

  if (!clientId) return null;
  return (
    <>
      <div className="auth-divider"><span>hoặc</span></div>
      {failed
        ? <p className="muted small">Không tải được nút Google (kiểm tra kết nối mạng).</p>
        : <div ref={ref} className="google-btn" />}
    </>
  );
}
