import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';

// Trang mở từ link mời: /invite/:token
export default function Invite() {
  const { token } = useParams();
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/invitations/${token}`).then((res) => setInfo(res.data)).catch((err) => setError(errMsg(err)));
  }, [token]);

  const accept = async () => {
    try {
      const res = await api.post(`/invitations/${token}/accept`);
      navigate(`/projects/${res.data.projectId}`);
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const back = encodeURIComponent(`/invite/${token}`);

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1>TaskFlow</h1>
        {error && <div className="alert">{error}</div>}
        {!info && !error && <p className="muted">Đang tải lời mời...</p>}
        {info && (
          <>
            <p>
              <strong>{info.inviterName}</strong> mời bạn tham gia dự án
            </p>
            <h2>{info.project?.name}</h2>
            <p className="muted small">Vai trò: {info.role === 'leader' ? 'Trưởng nhóm' : 'Thành viên'} · Gửi tới {info.email}</p>

            {loading && <p className="muted">Đang tải...</p>}
            {!loading && user && user.email === info.email && (
              <button type="button" className="btn primary" onClick={accept}>Tham gia dự án</button>
            )}
            {!loading && user && user.email !== info.email && (
              <>
                <div className="alert">
                  Link này dành cho <strong>{info.email}</strong>, nhưng bạn đang đăng nhập bằng {user.email}.
                </div>
                <button type="button" className="btn primary" onClick={logout}>Đăng xuất để dùng đúng tài khoản</button>
              </>
            )}
            {!loading && !user && (
              <>
                <Link className="btn primary center-text" to={`/register?email=${encodeURIComponent(info.email)}&next=${back}`}>
                  Tạo tài khoản và tham gia
                </Link>
                <p className="muted">Đã có tài khoản? <Link to={`/login?next=${back}`}>Đăng nhập</Link></p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
