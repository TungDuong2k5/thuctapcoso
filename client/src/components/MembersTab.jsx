import { useCallback, useEffect, useState } from 'react';
import api, { errMsg } from '../api/client';
import Avatar from './Avatar';

const RESULT_LABEL = {
  added: 'Đã thêm vào dự án',
  already: 'Đã là thành viên từ trước',
  invited: 'Chưa có tài khoản → đã tạo lời mời',
  invalid: 'Email không hợp lệ',
  inactive: 'Tài khoản đang bị khóa',
};

const inviteLink = (token) => `${window.location.origin}/invite/${token}`;

export default function MembersTab({ project, isLeader, onChange }) {
  const [emails, setEmails] = useState('');
  const [role, setRole] = useState('member');
  const [results, setResults] = useState([]);
  const [invites, setInvites] = useState([]);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');

  const loadInvites = useCallback(() => {
    if (isLeader) api.get(`/projects/${project.id}/invitations`).then((res) => setInvites(res.data));
  }, [project.id, isLeader]);

  useEffect(() => { loadInvites(); }, [loadInvites]);

  const add = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api.post(`/projects/${project.id}/members`, { emails, role });
      setResults(res.data.results);
      setEmails('');
      onChange();
      loadInvites();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const copy = async (token) => {
    try {
      await navigator.clipboard.writeText(inviteLink(token));
      setCopied(token);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      window.prompt('Sao chép link mời:', inviteLink(token));
    }
  };

  const cancel = async (inv) => {
    if (!window.confirm(`Hủy lời mời gửi tới ${inv.email}?`)) return;
    await api.delete(`/invitations/${inv.id}`);
    loadInvites();
  };

  const remove = async (m) => {
    if (!window.confirm(`Xóa ${m.fullName} khỏi dự án?`)) return;
    try {
      await api.delete(`/projects/${project.id}/members/${m.id}`);
      onChange();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  return (
    <div>
      {isLeader && (
        <form className="card" onSubmit={add}>
          <h3>Mời thành viên</h3>
          <p className="muted small">
            Nhập email của mọi người, mỗi email một dòng hoặc cách nhau bằng dấu phẩy.
            Ai đã có tài khoản sẽ vào dự án ngay; ai chưa có chỉ cần đăng ký bằng đúng email đó
            (hoặc mở link mời) là tự vào dự án.
          </p>
          <textarea
            rows={3}
            required
            placeholder={'ban1@gmail.com\nban2@gmail.com, ban3@gmail.com'}
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
          />
          <div className="row end" style={{ marginTop: 8 }}>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="member">Vai trò: Thành viên</option>
              <option value="leader">Vai trò: Trưởng nhóm</option>
            </select>
            <button type="submit" className="btn primary">Mời</button>
          </div>
          {results.length > 0 && (
            <ul className="result-list">
              {results.map((r) => (
                <li key={r.email} className={`result ${r.status}`}>
                  <strong>{r.email}</strong>: {RESULT_LABEL[r.status]}
                </li>
              ))}
            </ul>
          )}
        </form>
      )}
      {error && <div className="alert">{error}</div>}

      {isLeader && invites.length > 0 && (
        <div className="card">
          <h3>Lời mời đang chờ ({invites.length})</h3>
          <p className="muted small">Gửi link mời qua Zalo/Messenger cho người chưa có tài khoản để họ vào nhanh hơn.</p>
          <table className="table">
            <thead><tr><th>Email</th><th>Vai trò</th><th>Người mời</th><th /></tr></thead>
            <tbody>
              {invites.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.email}</td>
                  <td>{inv.role === 'leader' ? 'Trưởng nhóm' : 'Thành viên'}</td>
                  <td>{inv.inviter?.fullName}</td>
                  <td className="right">
                    <button type="button" className="btn ghost" onClick={() => copy(inv.token)}>
                      {copied === inv.token ? 'Đã sao chép ✓' : 'Sao chép link mời'}
                    </button>
                    <button type="button" className="btn ghost danger-text" onClick={() => cancel(inv)}>Hủy</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="section-title">Thành viên ({project.members.length})</h3>
      <div className="member-grid">
        {[...project.members]
          .sort((a, b) => (a.role === b.role ? a.fullName.localeCompare(b.fullName, 'vi') : a.role === 'leader' ? -1 : 1))
          .map((m) => (
            <div key={m.id} className="card member-card">
              <div className="member-top">
                <Avatar name={m.fullName} size={52} />
                <div className="grow">
                  <strong>{m.fullName}</strong>
                  <div className="row" style={{ gap: 6, marginTop: 4 }}>
                    <span className={`tag ${m.role}`}>{m.role === 'leader' ? 'Trưởng nhóm' : 'Thành viên'}</span>
                    {m.id === project.ownerId && <span className="tag">Người tạo</span>}
                  </div>
                </div>
                {isLeader && m.id !== project.ownerId && (
                  <button type="button" className="link danger-text" onClick={() => remove(m)}>Xóa</button>
                )}
              </div>

              <dl className="member-info">
                <dt>MSSV</dt><dd>{m.studentCode || <span className="muted">Chưa cập nhật</span>}</dd>
                <dt>Lớp</dt><dd>{m.className || <span className="muted">Chưa cập nhật</span>}</dd>
                <dt>Email</dt><dd><a href={`mailto:${m.email}`}>{m.email}</a></dd>
                <dt>Điện thoại</dt><dd>{m.phone ? <a href={`tel:${m.phone.replace(/\s/g, '')}`}>{m.phone}</a> : <span className="muted">Chưa cập nhật</span>}</dd>
                <dt>Ngày sinh</dt><dd>{m.dateOfBirth ? m.dateOfBirth.split('-').reverse().join('/') : <span className="muted">Chưa cập nhật</span>}</dd>
              </dl>
              {m.bio && <p className="member-bio">{m.bio}</p>}

              <div className="member-stats">
                <div><strong>{m.stats.total}</strong><small>được giao</small></div>
                <div><strong className="ok-text">{m.stats.done}</strong><small>đã xong</small></div>
                <div><strong className={m.stats.overdue ? 'overdue' : ''}>{m.stats.overdue}</strong><small>quá hạn</small></div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
