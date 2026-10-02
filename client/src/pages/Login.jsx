import { useCallback, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { errMsg } from '../api/client';
import GoogleButton from '../components/GoogleButton';

export default function Login() {
  const { user, login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rawNext = params.get('next') || '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(form.email, form.password);
      navigate(next);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const google = useCallback(async (credential) => {
    setError('');
    try {
      await loginWithGoogle(credential);
      navigate(next);
    } catch (err) {
      setError(errMsg(err));
    }
  }, [loginWithGoogle, navigate, next]);

  if (user) return <Navigate to={next} replace />;

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <h1>TaskFlow</h1>
        <p className="muted">Quản lý và báo cáo công việc nhóm</p>
        {error && <div className="alert">{error}</div>}
        <label>Email
          <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label>Mật khẩu
          <input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Đang đăng nhập...' : 'Đăng nhập'}</button>
        <GoogleButton onCredential={google} />
        <p className="muted">Chưa có tài khoản? <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`}>Đăng ký</Link></p>
      </form>
    </div>
  );
}
