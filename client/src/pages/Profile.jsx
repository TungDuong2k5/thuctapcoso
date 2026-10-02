import { useState } from 'react';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';

const PROFILE_KEYS = ['fullName', 'studentCode', 'className', 'phone', 'dateOfBirth', 'bio'];

function pickProfile(user) {
  return Object.fromEntries(PROFILE_KEYS.map((k) => [k, user[k] || '']));
}

export default function Profile() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState(pickProfile(user));
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const field = (key) => ({ value: form[key], onChange: (e) => setForm({ ...form, [key]: e.target.value }) });

  const save = async (payload, okText) => {
    setError('');
    setMessage('');
    try {
      const res = await api.put('/users/me', payload);
      // Đổi mật khẩu thì server cấp token mới (token cũ hết hiệu lực)
      if (res.data.newToken) localStorage.setItem('token', res.data.newToken);
      setUser(res.data);
      setForm(pickProfile(res.data));
      setMessage(okText);
      return true;
    } catch (err) {
      setError(errMsg(err));
      return false;
    }
  };

  const saveProfile = (e) => {
    e.preventDefault();
    save(form, 'Đã cập nhật thông tin cá nhân');
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (pw.newPassword !== pw.confirmPassword) {
      setError('Mật khẩu nhập lại không khớp');
      return;
    }
    if (await save(pw, 'Đã đổi mật khẩu. Các thiết bị khác đang đăng nhập sẽ phải đăng nhập lại.')) {
      setPw({ currentPassword: '', newPassword: '', confirmPassword: '' });
    }
  };

  return (
    <div className="profile-page">
      <div className="card profile-head">
        <Avatar name={form.fullName || user.fullName} size={72} />
        <div>
          <h2>{user.fullName}</h2>
          <div className="muted">{user.email}</div>
          <div className="muted small">
            {[user.studentCode && `MSSV ${user.studentCode}`, user.className && `Lớp ${user.className}`].filter(Boolean).join(' · ')
              || 'Hãy bổ sung MSSV và lớp để trưởng nhóm, giảng viên dễ nhận ra bạn'}
          </div>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}
      {message && <div className="info">{message}</div>}

      <form className="card" onSubmit={saveProfile}>
        <h3>Thông tin cá nhân</h3>
        <p className="muted small">Các thành viên trong cùng dự án sẽ xem được thông tin này ở tab Thành viên.</p>
        <div className="form-grid">
          <label className="span2">Họ và tên<input required maxLength={100} {...field('fullName')} /></label>
          <label>MSSV<input maxLength={20} placeholder="VD: B22DCCN001" {...field('studentCode')} /></label>
          <label>Lớp<input maxLength={50} placeholder="VD: D22CQCN01-B" {...field('className')} /></label>
          <label>Số điện thoại<input type="tel" maxLength={15} placeholder="VD: 0912 345 678" {...field('phone')} /></label>
          <label>Ngày sinh<input type="date" max={new Date().toISOString().slice(0, 10)} {...field('dateOfBirth')} /></label>
          <label className="span2">Giới thiệu / kỹ năng
            <textarea rows={3} maxLength={500} placeholder="VD: Mạnh về React, thiết kế giao diện; phụ trách frontend" {...field('bio')} />
          </label>
          <label className="span2">Email<input disabled value={user.email} /></label>
        </div>
        <div className="row end"><button type="submit" className="btn primary">Lưu thông tin</button></div>
      </form>

      <form className="card" onSubmit={savePassword}>
        <h3>{user.hasPassword === false ? 'Đặt mật khẩu' : 'Đổi mật khẩu'}</h3>
        <p className="muted small">
          {user.hasPassword === false
            ? 'Bạn đang đăng nhập bằng Google. Đặt mật khẩu nếu muốn đăng nhập thêm bằng email + mật khẩu.'
            : 'Quên mật khẩu hiện tại? Đăng nhập bằng Google, hoặc nhờ quản trị viên tạo link đặt lại mật khẩu.'}
        </p>
        <div className="form-grid">
          {user.hasPassword !== false && (
            <label>Mật khẩu hiện tại
              <input type="password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
            </label>
          )}
          <label>Mật khẩu mới (tối thiểu 6 ký tự)
            <input type="password" required minLength={6} autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          </label>
          <label>Nhập lại mật khẩu mới
            <input type="password" required autoComplete="new-password" value={pw.confirmPassword} onChange={(e) => setPw({ ...pw, confirmPassword: e.target.value })} />
            {pw.confirmPassword && pw.confirmPassword !== pw.newPassword && <small className="field-error">Mật khẩu nhập lại không khớp</small>}
          </label>
        </div>
        <div className="row end"><button type="submit" className="btn">{user.hasPassword === false ? 'Đặt mật khẩu' : 'Đổi mật khẩu'}</button></div>
      </form>
    </div>
  );
}
