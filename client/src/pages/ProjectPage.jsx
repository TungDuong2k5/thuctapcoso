import { useCallback, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useParams } from 'react-router-dom';
import api, { errMsg, getSocket } from '../api/client';
import Board from '../components/Board';
import ReportsTab from '../components/ReportsTab';
import StatsTab from '../components/StatsTab';
import MembersTab from '../components/MembersTab';

export default function ProjectPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get(`/projects/${id}`).then((res) => setProject(res.data)).catch((err) => setError(errMsg(err)));
  }, [id]);

  useEffect(() => {
    load();
    const socket = getSocket();
    const join = () => socket.emit('project:join', Number(id));
    join();
    socket.on('connect', join); // vào lại phòng khi mất kết nối
    return () => {
      socket.off('connect', join);
      socket.emit('project:leave', Number(id));
    };
  }, [id, load]);

  if (error) return <div className="alert">{error}</div>;
  if (!project) return <p className="muted">Đang tải...</p>;

  const isLeader = project.myRole === 'leader';
  const base = `/projects/${id}`;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>{project.name}</h2>
          <small className="muted">{project.startDate || '?'} → {project.endDate || '?'} · {project.members.length} thành viên</small>
        </div>
        <nav className="tabs">
          <NavLink to={base} end>Bảng công việc</NavLink>
          <NavLink to={`${base}/reports`}>Báo cáo tuần</NavLink>
          <NavLink to={`${base}/stats`}>Thống kê</NavLink>
          <NavLink to={`${base}/members`}>Thành viên</NavLink>
        </nav>
      </div>
      <Routes>
        <Route index element={<Board project={project} isLeader={isLeader} />} />
        <Route path="reports" element={<ReportsTab project={project} isLeader={isLeader} />} />
        <Route path="stats" element={<StatsTab project={project} />} />
        <Route path="members" element={<MembersTab project={project} isLeader={isLeader} onChange={load} />} />
      </Routes>
    </div>
  );
}
