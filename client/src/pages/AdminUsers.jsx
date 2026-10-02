import { useEffect, useState } from 'react';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [resetInfo, setResetInfo] = useState(null);

  const load = () => api.get('/admin/users').then((res) => setUsers(res.data));
  useEffect(() => { load(); }, []);

  const update = async (id, data) => {
    setError('');
    try {
      await api.patch(`/admin/users/${id}`, data);
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const makeResetLink = async (u) => {
    setError('');
    try {
      const res = await api.post(`/admin/users/${u.id}/reset-link`);
      setResetInfo({ name: u.fullName, ...res.data });
    } catch (err) {
      setError(errMsg(err));
    }
  };

  return (
    <div>
      <div className="page-head"><h2>Quản lý người dùng</h2></div>
      {error && <div className="alert">{error}</div>}
      {resetInfo && (
        <div className="info">
          Link đặt lại mật khẩu cho <strong>{resetInfo.name}</strong> (hết hạn sau {resetInfo.expiresInMinutes} phút, dùng 1 lần).
          Gửi link này riêng cho đúng người đó:
          <div className="row" style={{ marginTop: 6 }}>
            <input className="grow" readOnly value={resetInfo.link} onFocus={(e) => e.target.select()} />
            <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(resetInfo.link)}>Sao chép</button>
            <button type="button" className="btn ghost" onClick={() => setResetInfo(null)}>Đóng</button>
          </div>
        </div>
      )}
      <div className="card">
        <table className="table">
          <thead><tr><th>ID</th><th>Họ tên</th><th>Email</th><th>Vai trò</th><th>Trạng thái</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.id}</td>
                <td>{u.fullName}</td>
                <td>{u.email}</td>
                <td>
                  <select value={u.systemRole} disabled={u.id === me.id} onChange={(e) => update(u.id, { systemRole: e.target.value })}>
                    <option value="user">Người dùng</option>
                    <option value="admin">Quản trị</option>
                  </select>
                </td>
                <td>{u.isActive ? 'Hoạt động' : <span className="overdue">Đã khóa</span>}</td>
                <td className="right">
                  <button type="button" className="btn ghost" onClick={() => makeResetLink(u)}>Link đặt lại MK</button>
                  {u.id !== me.id && (
                    <button type="button" className="btn ghost" onClick={() => update(u.id, { isActive: !u.isActive })}>
                      {u.isActive ? 'Khóa' : 'Mở khóa'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
