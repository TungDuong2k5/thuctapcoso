import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';

// Trang mở từ link đặt lại mật khẩu do admin tạo: tạo mật khẩu mới → nhập lại → xác nhận đổi
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { user, logout } = useAuth();
  const [email, setEmail] = useState(null);
  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [linkError, setLinkError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/auth/reset-password', { params: { token } })
      .then((res) => setEmail(res.data.email))
      .catch((err) => setLinkError(errMsg(err)));
  }, [token]);

  const tooShort = form.password.length > 0 && form.password.length < 6;
  const mismatch = form.confirmPassword.length > 0 && form.confirmPassword !== form.password;

  const submit = async (e) => {
    e.preventDefault();
    if (form.password.length < 6) return setError('Mật khẩu mới tối thiểu 6 ký tự');
    if (form.password !== form.confirmPassword) return setError('Mật khẩu nhập lại không khớp');
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/auth/reset-password', { token, ...form });
      if (user) logout(); // phiên cũ đã hết hiệu lực sau khi đổi mật khẩu
      setDone(res.data.message);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Tạo mật khẩu mới</h1>

        {linkError && (
          <>
            <div className="alert">{linkError}</div>
            <p className="muted small">Nhờ quản trị viên tạo link mới, hoặc đăng nhập bằng Google.</p>
          </>
        )}
        {!linkError && !email && <p className="muted">Đang kiểm tra link...</p>}

        {done && (
          <>
            <div className="info">{done}</div>
            <Link to="/login" className="btn primary center-text">Đăng nhập</Link>
          </>
        )}

        {email && !done && (
          <>
            <p className="muted">Tài khoản: <strong>{email}</strong></p>
            {error && <div className="alert">{error}</div>}
            <label>Mật khẩu mới
              <input
                type={show ? 'text' : 'password'}
                required
                minLength={6}
                autoFocus
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              {tooShort && <small className="field-error">Tối thiểu 6 ký tự</small>}
            </label>
            <label>Nhập lại mật khẩu mới
              <input
                type={show ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              />
              {mismatch && <small className="field-error">Mật khẩu nhập lại không khớp</small>}
              {!mismatch && form.confirmPassword && !tooShort && <small className="field-ok">Mật khẩu khớp ✓</small>}
            </label>
            <label className="check">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Hiện mật khẩu
            </label>
            <button type="submit" className="btn primary" disabled={busy || tooShort || mismatch} style={{ marginTop: 12 }}>
              {busy ? 'Đang đổi...' : 'Xác nhận đổi mật khẩu'}
            </button>
          </>
        )}
        <p className="muted"><Link to="/login">← Quay lại đăng nhập</Link></p>
      </form>
    </div>
  );
}
