import { useCallback, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { errMsg } from '../api/client';
import GoogleButton from '../components/GoogleButton';

export default function Register() {
  const { user, register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rawNext = params.get('next') || '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
  const [form, setForm] = useState({ fullName: '', email: params.get('email') || '', password: '' });
  const [error, setError] = useState('');

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

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await register(form);
      navigate(next);
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const field = (key) => ({ value: form[key], onChange: (e) => setForm({ ...form, [key]: e.target.value }) });

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Tạo tài khoản</h1>
        {error && <div className="alert">{error}</div>}
        <label>Họ tên<input required {...field('fullName')} /></label>
        <label>Email<input type="email" required {...field('email')} /></label>
        <label>Mật khẩu (tối thiểu 6 ký tự)<input type="password" required minLength={6} {...field('password')} /></label>
        <button type="submit" className="btn primary">Đăng ký</button>
        <GoogleButton onCredential={google} text="signup_with" />
        <p className="muted">Đã có tài khoản? <Link to={`/login${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`}>Đăng nhập</Link></p>
      </form>
    </div>
  );
}
