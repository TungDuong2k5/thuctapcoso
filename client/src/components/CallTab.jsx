import { useCallback, useEffect, useState } from 'react';
import api, { errMsg, getSocket } from '../api/client';
import CallRoom from './CallRoom';

// Gọi nhóm: trưởng nhóm mở phòng (mã phòng + mật khẩu) và gửi cho thành viên; mọi người nhập mã + mật khẩu để vào
export default function CallTab({ project, isLeader, initialCode = '' }) {
  const [rooms, setRooms] = useState([]);
  const [form, setForm] = useState({ title: '', password: '', notify: true });
  const [join, setJoin] = useState({ code: initialCode, password: '' });
  const [session, setSession] = useState(null); // { token, room } khi đã vào phòng
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    api.get(`/projects/${project.id}/calls`).then((res) => setRooms(res.data)).catch(() => {});
  }, [project.id]);

  useEffect(() => {
    load();
    const socket = getSocket();
    socket.on('call:changed', load);
    return () => socket.off('call:changed', load);
  }, [load]);

  // Mở từ thông báo mời gọi → điền sẵn mã phòng
  useEffect(() => {
    if (initialCode) setJoin((j) => ({ ...j, code: initialCode }));
  }, [initialCode]);

  const active = rooms[0];
  useEffect(() => {
    if (active && !join.code) setJoin((j) => ({ ...j, code: active.code }));
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn, ok) => {
    setError('');
    setMessage('');
    try {
      await fn();
      if (ok) setMessage(ok);
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const create = (e) => {
    e.preventDefault();
    run(async () => {
      const res = await api.post(`/projects/${project.id}/calls`, form);
      setJoin({ code: res.data.code, password: res.data.password });
      setForm({ title: '', password: '', notify: true });
      load();
    }, form.notify ? 'Đã mở phòng và gửi mã phòng + mật khẩu cho các thành viên qua thông báo' : 'Đã mở phòng gọi');
  };

  const invite = () => run(async () => {
    const res = await api.post(`/calls/${active.id}/invite`, {});
    setMessage(`Đã gửi mã phòng + mật khẩu cho ${res.data.sent} người`);
  });

  const end = () => {
    if (!window.confirm('Kết thúc cuộc gọi cho tất cả mọi người?')) return;
    run(async () => {
      await api.post(`/calls/${active.id}/end`);
      setSession(null);
      load();
    }, 'Đã kết thúc cuộc gọi');
  };

  const enter = (e) => {
    e?.preventDefault();
    run(async () => {
      const res = await api.post('/calls/join', join);
      setSession(res.data);
    });
  };

  const copy = async () => {
    const text = `Cuộc gọi nhóm "${active.title || project.name}"\nMã phòng: ${active.code}\nMật khẩu: ${active.password}\nVào: ${window.location.origin}/projects/${project.id}/call?code=${active.code}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Sao chép thông tin phòng:', text);
    }
  };

  if (session) {
    return (
      <CallRoom
        token={session.token}
        room={session.room}
        isLeader={isLeader}
        onLeave={(reason) => { setSession(null); load(); if (reason) setMessage(reason); }}
        onEnd={end}
      />
    );
  }

  return (
    <div className="call-page">
      {error && <div className="alert">{error}</div>}
      {message && <div className="info">{message}</div>}

      {isLeader && !active && (
        <form className="card" onSubmit={create}>
          <h3>📞 Mở cuộc gọi nhóm</h3>
          <p className="muted small">
            Hệ thống tạo <strong>mã phòng</strong>, mật khẩu do bạn đặt (để trống thì tự tạo 6 số).
            Các thành viên phải nhập đúng mã phòng + mật khẩu mới vào được.
          </p>
          <div className="form-grid">
            <label>Tên cuộc gọi (không bắt buộc)
              <input maxLength={100} placeholder="VD: Họp tiến độ tuần 5" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label>Mật khẩu phòng
              <input maxLength={20} placeholder="Để trống = tự tạo 6 số" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value.replace(/[^A-Za-z0-9]/g, '') })} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={form.notify} onChange={(e) => setForm({ ...form, notify: e.target.checked })} />
            Gửi mã phòng + mật khẩu cho tất cả thành viên qua thông báo
          </label>
          <div className="row end"><button type="submit" className="btn primary">Mở phòng gọi</button></div>
        </form>
      )}

      {active && (
        <div className="card call-active">
          <div className="row between">
            <div>
              <h3>🔴 Đang có cuộc gọi: {active.title || project.name}</h3>
              <small className="muted">Mở bởi {active.host?.fullName} lúc {new Date(active.createdAt).toLocaleTimeString('vi-VN')}</small>
            </div>
          </div>
          <div className="call-codes">
            <div><small>Mã phòng</small><strong>{active.code}</strong></div>
            {isLeader && <div><small>Mật khẩu</small><strong>{active.password}</strong></div>}
          </div>
          {isLeader && (
            <div className="row">
              <button type="button" className="btn" onClick={invite}>Gửi lại cho thành viên</button>
              <button type="button" className="btn" onClick={copy}>{copied ? 'Đã sao chép ✓' : 'Sao chép mã + mật khẩu'}</button>
              <button type="button" className="btn danger" onClick={end}>Kết thúc cuộc gọi</button>
            </div>
          )}
        </div>
      )}

      <form className="card narrow" onSubmit={enter}>
        <h3>Vào phòng gọi</h3>
        <p className="muted small">
          {isLeader ? 'Nhập mã phòng + mật khẩu (đã điền sẵn phòng bạn vừa mở).' : 'Nhập mã phòng và mật khẩu trưởng nhóm gửi cho bạn (xem trong mục Thông báo).'}
        </p>
        <label>Mã phòng
          <input required maxLength={8} className="code-input" placeholder="VD: K7M2QX" value={join.code} onChange={(e) => setJoin({ ...join, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} />
        </label>
        <label>Mật khẩu
          <input required type="password" maxLength={20} autoComplete="off" value={join.password} onChange={(e) => setJoin({ ...join, password: e.target.value })} />
        </label>
        <p className="muted small">Trình duyệt sẽ hỏi quyền dùng micro và camera; không có camera vẫn vào được bằng giọng nói.</p>
        <div className="row end"><button type="submit" className="btn primary">Vào phòng</button></div>
      </form>
    </div>
  );
}
