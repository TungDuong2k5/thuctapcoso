import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';

// Trang mở từ link mời chung của dự án: /join/:code
export default function JoinProject() {
  const { code } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/join/${code}`).then((res) => setInfo(res.data)).catch((err) => setError(errMsg(err)));
  }, [code]);

  const join = async () => {
    try {
      const res = await api.post(`/join/${code}`);
      navigate(`/projects/${res.data.projectId}`);
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const back = encodeURIComponent(`/join/${code}`);

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <img src="/logo.png" alt="TaskFlow" className="auth-logo" />
        {error && <div className="alert">{error}</div>}
        {!info && !error && <p className="muted">Đang tải lời mời...</p>}
        {info && (
          <>
            <p><strong>{info.ownerName}</strong> mời bạn tham gia dự án</p>
            <h2>{info.project.name}</h2>
            <p className="muted small">Vai trò: Thành viên</p>
            {loading && <p className="muted">Đang tải...</p>}
            {!loading && user && (
              <div className="invite-actions">
                <button type="button" className="btn primary" onClick={join}>Tham gia dự án</button>
              </div>
            )}
            {!loading && !user && (
              <>
                <Link className="btn primary center-text" to={`/register?next=${back}`}>Tạo tài khoản để tham gia</Link>
                <p className="muted">Đã có tài khoản? <Link to={`/login?next=${back}`}>Đăng nhập</Link></p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
