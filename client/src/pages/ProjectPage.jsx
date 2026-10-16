import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import api, { errMsg, getSocket } from '../api/client';
import Board from '../components/Board';
import ProjectMenu from '../components/ProjectMenu';
import ChatTab from '../components/ChatTab';
import CallTab from '../components/CallTab';
import { useAuth } from '../context/AuthContext';

export const ROLE_LABEL = { leader: 'Trưởng nhóm', member: 'Thành viên', guest: 'Khách (chỉ xem)' };

export default function ProjectPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [error, setError] = useState('');
  const [unreadChat, setUnreadChat] = useState(0);
  const [hasCall, setHasCall] = useState(false);
  const { user } = useAuth();
  const location = useLocation();
  // Khung nổi ở góc dưới bên phải: null | 'chat' | 'call'
  const [panel, setPanel] = useState(null);
  const [callCode, setCallCode] = useState('');
  const onChat = panel === 'chat';

  const load = useCallback(() => {
    api.get(`/projects/${id}`).then((res) => setProject(res.data)).catch((err) => setError(errMsg(err)));
  }, [id]);

  useEffect(() => {
    load();
    const socket = getSocket();
    const join = () => socket.emit('project:join', Number(id));
    const deleted = () => {
      window.alert('Dự án này vừa bị xóa.');
      navigate('/', { replace: true });
    };
    join();
    socket.on('connect', join); // vào lại phòng khi mất kết nối
    socket.on('project:changed', load);
    socket.on('project:deleted', deleted);
    // Công việc thay đổi → cập nhật tiến độ từng người (gom lại, tránh tải liên tục)
    let timer;
    const taskChanged = () => { clearTimeout(timer); timer = setTimeout(load, 600); };
    socket.on('task:changed', taskChanged);
    return () => {
      clearTimeout(timer);
      socket.off('task:changed', taskChanged);
      socket.off('connect', join);
      socket.off('project:changed', load);
      socket.off('project:deleted', deleted);
      socket.emit('project:leave', Number(id));
    };
  }, [id, load, navigate]);

  // Link dạng cũ (VD trong thông báo): /chat, /call → mở khung nổi; /reports, /members, /settings... → mở mục trong menu ☰
  useEffect(() => {
    const m = location.pathname.match(/\/projects\/\d+\/(\w+)$/);
    if (!m) return;
    const search = new URLSearchParams(location.search);
    const panelOf = {
      reports: 'overview', overview: 'overview', stats: 'overview', members: 'members', settings: 'settings', list: 'list', calendar: 'calendar', new: 'new',
    };
    if (m[1] === 'chat' || m[1] === 'call') {
      if (m[1] === 'call') setCallCode(search.get('code') || '');
      setPanel(m[1]);
      search.delete('code');
    } else if (panelOf[m[1]]) {
      search.set('panel', panelOf[m[1]]);
    }
    const qs = search.toString();
    navigate(`/projects/${id}${qs ? `?${qs}` : ''}`, { replace: true });
  }, [location.pathname, location.search, id, navigate]);

  // Tin nhắn mới khi khung chat đang đóng → hiện số chưa đọc trên nút chat
  useEffect(() => {
    if (onChat) setUnreadChat(0);
    const socket = getSocket();
    const onNew = (m) => {
      if (m.projectId === Number(id) && m.userId !== user.id && !onChat) setUnreadChat((n) => n + 1);
    };
    socket.on('chat:new', onNew);
    return () => socket.off('chat:new', onNew);
  }, [id, onChat, user.id]);

  // Có cuộc gọi đang diễn ra → chấm đỏ trên tab Gọi nhóm
  useEffect(() => {
    const check = () => api.get(`/projects/${id}/calls`).then((res) => setHasCall(res.data.length > 0)).catch(() => {});
    check();
    const socket = getSocket();
    socket.on('call:changed', check);
    return () => socket.off('call:changed', check);
  }, [id]);

  // Báo vai trò cho thanh bên (sáng mục "Dự án của tôi" hoặc "Dự án đã tham gia")
  const myRole = project?.myRole;
  useEffect(() => {
    if (myRole) window.dispatchEvent(new CustomEvent('taskflow:project-role', { detail: myRole }));
  }, [myRole]);

  if (error) return <div className="alert">{error}</div>;
  if (!project) return <p className="muted">Đang tải...</p>;

  const isLeader = project.myRole === 'leader';
  const isGuest = project.myRole === 'guest';
  const viDate = (d) => (d ? d.split('-').reverse().join('/') : '?');

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>
            {project.name}
            {project.status === 'archived' && <span className="finished-badge">✅ Đã hoàn thành</span>}
          </h2>
          <small className="muted">
            {viDate(project.startDate)} → {viDate(project.endDate)} · {project.members.length} thành viên ·
            Vai trò của bạn: <span className={`tag ${project.myRole}`}>{ROLE_LABEL[project.myRole]}</span>
          </small>
        </div>
        <ProjectMenu project={project} isLeader={isLeader} isGuest={isGuest} onProjectChange={load} />
      </div>
      <Board project={project} isLeader={isLeader} isGuest={isGuest} />

      {/* Khung trò chuyện / gọi nhóm: luôn giữ trong trang để đóng khung không làm rớt cuộc gọi */}
      <div className={`float-panel chat-panel ${panel === 'chat' ? 'open' : ''}`} aria-hidden={panel !== 'chat'}>
        <button type="button" className="float-close" title="Thu nhỏ" onClick={() => setPanel(null)}>×</button>
        <ChatTab project={project} isGuest={isGuest} visible={panel === 'chat'} />
      </div>
      <div className={`float-panel call-panel ${panel === 'call' ? 'open' : ''}`} aria-hidden={panel !== 'call'}>
        <div className="float-panel-head">
          <strong>📞 Gọi nhóm</strong>
          <button type="button" className="float-close" title="Thu nhỏ (cuộc gọi vẫn tiếp tục)" onClick={() => setPanel(null)}>×</button>
        </div>
        <CallTab project={project} isLeader={isLeader} initialCode={callCode} />
      </div>

      <div className="float-dock">
        <button
          type="button"
          className={`float-btn call-btn ${panel === 'call' ? 'active' : ''}`}
          title="Gọi nhóm"
          onClick={() => setPanel(panel === 'call' ? null : 'call')}
        >
          📞{hasCall && <span className="live-dot" title="Đang có cuộc gọi" />}
        </button>
        <button
          type="button"
          className={`float-btn chat-btn ${panel === 'chat' ? 'active' : ''}`}
          title="Trò chuyện nhóm"
          onClick={() => setPanel(panel === 'chat' ? null : 'chat')}
        >
          💬{unreadChat > 0 && <span className="badge">{unreadChat > 99 ? '99+' : unreadChat}</span>}
        </button>
      </div>
    </div>
  );
}
