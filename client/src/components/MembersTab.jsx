import { useCallback, useEffect, useRef, useState } from 'react';
import api, { errMsg, formatPhone } from '../api/client';
import Avatar from './Avatar';
import { PaceBadge } from './MemberProgress';
import { paceTone } from './taskMeta';
import { useAuth } from '../context/AuthContext';

const ROLE_LABEL = { leader: 'Trưởng nhóm', member: 'Thành viên', guest: 'Khách (chỉ xem)' };
const ROLE_ORDER = { leader: 0, member: 1, guest: 2 };

const RESULT_LABEL = {
  invited: 'Đã gửi lời mời, chờ người đó bấm Tham gia',
  invited_new: 'Chưa có tài khoản → đã tạo lời mời (gửi link cho họ để đăng ký)',
  already_invited: 'Đã mời trước đó, đang chờ xác nhận',
  already: 'Đã là thành viên từ trước',
  invalid: 'Email không hợp lệ',
  inactive: 'Tài khoản đang bị khóa',
};

const inviteLink = (token) => `${window.location.origin}/invite/${token}`;

// Ảnh đại diện của chính mình: bấm để đổi ảnh (JPG/PNG/WEBP/GIF, tối đa 2MB)
function MyAvatar({ me, onChanged }) {
  const { setUser } = useAuth();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      window.alert('Ảnh tối đa 2MB');
      return;
    }
    const data = new FormData();
    data.append('avatar', file);
    setBusy(true);
    try {
      const res = await api.post('/users/me/avatar', data);
      setUser(res.data);
      onChanged();
    } catch (err) {
      window.alert(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className="avatar-upload" title="Đổi ảnh đại diện" onClick={() => input.current.click()} disabled={busy}>
      <Avatar name={me.fullName} src={me.avatarUrl} size={52} />
      <span className="avatar-upload-badge">{busy ? '…' : '📷'}</span>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { upload(e.target.files[0]); e.target.value = ''; }} />
    </button>
  );
}

// part: 'invite' = chỉ phần mời · 'list' = chỉ danh sách thành viên · bỏ trống = cả hai
export default function MembersTab({
  project, isLeader, onChange, part,
}) {
  const { user } = useAuth();
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

  const changeRole = async (m, newRole) => {
    setError('');
    try {
      await api.patch(`/projects/${project.id}/members/${m.id}`, { role: newRole });
      onChange();
    } catch (err) {
      setError(errMsg(err));
    }
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
      {isLeader && part !== 'list' && (
        <form className="card" onSubmit={add}>
          <h3>Mời thành viên</h3>
          <p className="muted small">
            Nhập email của mọi người, mỗi email một dòng hoặc cách nhau bằng dấu phẩy.
            Mỗi người nhận một lời mời và tự bấm Tham gia hoặc Từ chối (bạn sẽ nhận thông báo kết quả).
            Ai chưa có tài khoản thì đăng ký bằng đúng email đó (hoặc mở link mời) sẽ thấy lời mời.
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
              <option value="guest">Vai trò: Khách (chỉ xem)</option>
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
      {part === 'invite' && !isLeader && <p className="muted">Chỉ trưởng nhóm được mời thành viên.</p>}

      {isLeader && part !== 'list' && invites.length > 0 && (
        <div className="card">
          <h3>Lời mời đang chờ ({invites.length})</h3>
          <p className="muted small">Gửi link mời qua Zalo/Messenger cho người chưa có tài khoản để họ vào nhanh hơn.</p>
          <table className="table">
            <thead><tr><th>Email</th><th>Vai trò</th><th>Người mời</th><th /></tr></thead>
            <tbody>
              {invites.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.email}</td>
                  <td>{ROLE_LABEL[inv.role]}</td>
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

      {part !== 'invite' && (
        <>
      <h3 className="section-title">Thành viên ({project.members.length})</h3>
      <div className="member-grid">
        {[...project.members]
          .sort((a, b) => (ROLE_ORDER[a.role] - ROLE_ORDER[b.role]) || a.fullName.localeCompare(b.fullName, 'vi'))
          .map((m) => (
            <div key={m.id} className={`card member-card pace-${paceTone(m.stats)}`}>
              <div className="member-top">
                {m.id === user.id
                  ? <MyAvatar me={m} onChanged={onChange} />
                  : <Avatar name={m.fullName} src={m.avatarUrl} size={52} />}
                <div className="grow">
                  <strong>{m.fullName}</strong>
                  <div className="row" style={{ gap: 6, marginTop: 4 }}>
                    {isLeader && m.id !== project.ownerId ? (
                      <select className={`role-select tag ${m.role}`} value={m.role} onChange={(e) => changeRole(m, e.target.value)} title="Đổi vai trò">
                        {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    ) : (
                      <span className={`tag ${m.role}`}>{ROLE_LABEL[m.role]}</span>
                    )}
                    {m.id === project.ownerId && <span className="tag">Người tạo</span>}
                    {m.stats && <PaceBadge stats={m.stats} />}
                  </div>
                </div>
                {isLeader && m.id !== project.ownerId && (
                  <button type="button" className="link danger-text" onClick={() => remove(m)}>Xóa</button>
                )}
              </div>

              <dl className="member-info">
                <dt>MSSV</dt><dd>{m.studentCode || <span className="muted">Chưa cập nhật</span>}</dd>
                <dt>Lớp</dt><dd>{m.className || <span className="muted">Chưa cập nhật</span>}</dd>
                <dt>Email</dt><dd>{m.email ? <a href={`mailto:${m.email}`}>{m.email}</a> : <span className="muted">Chưa cập nhật</span>}</dd>
                <dt>Điện thoại</dt><dd>{m.phone ? <a href={`tel:${m.phone}`}>{formatPhone(m.phone)}</a> : <span className="muted">Chưa cập nhật</span>}</dd>
                <dt>Ngày sinh</dt><dd>{m.dateOfBirth ? m.dateOfBirth.split('-').reverse().join('/') : <span className="muted">Chưa cập nhật</span>}</dd>
              </dl>
              {m.bio && <p className="member-bio">{m.bio}</p>}

              {m.stats && (
              <div className="member-stats">
                <div><strong>{m.stats.total}</strong><small>được giao</small></div>
                <div><strong className="ok-text">{m.stats.done}</strong><small>đã xong</small></div>
                <div><strong className={m.stats.overdue ? 'overdue' : ''}>{m.stats.overdue}</strong><small>quá hạn</small></div>
              </div>
              )}
            </div>
          ))}
      </div>
        </>
      )}
    </div>
  );
}
