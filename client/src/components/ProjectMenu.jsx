import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Avatar from './Avatar';
import Profile from '../pages/Profile';
import useTasks from '../hooks/useTasks';
import NewTaskForm from './NewTaskForm';
import ListView from './ListView';
import CalendarView from './CalendarView';
import ProgressReport from './ProgressReport';
import MembersTab from './MembersTab';
import ProjectSettings from './ProjectSettings';
import AppearanceSettings from './AppearanceSettings';

// Các mục trong menu ☰ của dự án (chỉ hiện tiêu đề; bấm vào mới mở nội dung toàn màn hình)
function menuItems({ isGuest }) {
  return [
    !isGuest && { key: 'new', icon: '➕', title: 'Thiết lập công việc mới' },
    { key: 'list', icon: '📋', title: 'Danh sách công việc' },
    { key: 'calendar', icon: '📅', title: 'Lịch' },
    { key: 'overview', icon: '📊', title: 'Tổng quan' },
    { key: 'settings', icon: '⚙️', title: 'Cài đặt' },
    { key: 'profile', icon: '👤', title: 'Thông tin cá nhân' },
  ].filter(Boolean);
}
// Link cũ ?panel=members → mở Cài đặt (phần Thành viên nằm trong Cài đặt)
const ALIAS = { members: 'settings', report: 'overview' };

// Nút ☰ + ngăn kéo bên phải (xem trước) + khung toàn màn hình khi bấm vào một mục
export default function ProjectMenu({
  project, isLeader, isGuest, onProjectChange,
}) {
  const [params, setParams] = useSearchParams();
  const { user, logout } = useAuth();
  // Chỗ đặt nút ☰ trên thanh trên cùng (do Layout tạo sẵn)
  const [slot, setSlot] = useState(null);
  useEffect(() => { setSlot(document.getElementById('topbar-menu-slot')); }, []);
  const navigate = useNavigate();
  const signOut = () => {
    if (!window.confirm('Đăng xuất khỏi TaskFlow?')) return;
    logout();
    navigate('/login');
  };
  const panel = ALIAS[params.get('panel')] || params.get('panel');
  const drawerOpen = params.get('menu') === '1';
  const items = menuItems({ isGuest });
  const current = items.find((i) => i.key === panel);

  const update = (changes) => setParams((p) => {
    const next = new URLSearchParams(p);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    return next;
  });
  const openPanel = (key) => update({ panel: key, menu: null });
  const closePanel = () => update({ panel: null, week: null });

  // Esc: đóng khung toàn màn hình / ngăn kéo (trừ khi đang mở chi tiết công việc)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || params.get('task')) return;
      if (panel) closePanel();
      else if (drawerOpen) update({ menu: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const button = (
    <button
      type="button"
      className={`hamburger ${drawerOpen ? 'open' : ''}`}
      title="Menu"
      aria-label="Menu"
      onClick={() => update({ menu: drawerOpen ? null : '1' })}
    >
      <span /><span /><span />
    </button>
  );

  return (
    <>
      {slot ? createPortal(button, slot) : null}

      {drawerOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => update({ menu: null })} />
          <aside className="drawer" aria-label="Menu dự án">
            <div className="drawer-head">
              <strong>{project.name}</strong>
              <button type="button" className="float-close" onClick={() => update({ menu: null })}>×</button>
            </div>
            <nav className="drawer-items">
              {items.map((i) => (
                <button type="button" key={i.key} className={`drawer-item ${panel === i.key ? 'active' : ''}`} onClick={() => openPanel(i.key)}>
                  <span className="drawer-icon">{i.icon}</span>
                  <span className="grow">{i.title}</span>
                  <span className="muted">›</span>
                </button>
              ))}
            </nav>
            <div className="drawer-foot">
              <div className="drawer-user">
                <Avatar name={user.fullName} src={user.avatarUrl} size={34} />
                <div><strong>{user.fullName}</strong><small className="muted">{user.email}</small></div>
              </div>
              <button type="button" className="drawer-item logout" onClick={signOut}>
                <span className="drawer-icon">🚪</span>
                <span className="grow">Đăng xuất</span>
              </button>
            </div>
          </aside>
        </>
      )}

      {current && (
        <div className="fullscreen" role="dialog" aria-label={current.title}>
          <div className="fullscreen-head">
            <button type="button" className="btn ghost" onClick={closePanel}>← Bảng công việc</button>
            <h2>{current.icon} {current.title}</h2>
            <div className="row">
              <button type="button" className="btn ghost" onClick={() => update({ menu: '1' })} title="Mở menu">☰ Menu</button>
              <button type="button" className="float-close" title="Đóng (Esc)" onClick={closePanel}>×</button>
            </div>
          </div>
          <div className="fullscreen-body">
            <PanelContent
              panel={current.key}
              project={project}
              isLeader={isLeader}
              isGuest={isGuest}
              onProjectChange={onProjectChange}
              openTask={(id) => update({ task: id })}
            />
          </div>
        </div>
      )}
    </>
  );
}

function PanelContent({
  panel, project, isLeader, isGuest, onProjectChange, openTask,
}) {
  const [params] = useSearchParams();
  switch (panel) {
    case 'new': return <NewTaskForm project={project} onOpenTask={openTask} />;
    case 'list': return <TasksPanel project={project} render={(tasks) => <ListView tasks={tasks} onOpen={openTask} />} />;
    case 'calendar': return <TasksPanel project={project} render={(tasks) => <CalendarView tasks={tasks} onOpen={openTask} />} />;
    case 'overview': return <ProgressReport project={project} isLeader={isLeader} isGuest={isGuest} initialTab={params.get('week') ? 'weekly' : 'all'} />;
    case 'profile': return <Profile />;
    case 'settings': return <SettingsPanel project={project} isLeader={isLeader} onProjectChange={onProjectChange} initial={params.get('panel') === 'members' ? 'members' : null} />;
    default: return null;
  }
}

function TasksPanel({ project, render }) {
  const { tasks, loaded } = useTasks(project.id);
  if (!loaded) return <p className="muted">Đang tải...</p>;
  return render(tasks);
}

// Cài đặt: Thành viên (mời người, đổi ảnh đại diện) + Dự án (trưởng nhóm: thông tin, nhãn, xóa dự án)
function SettingsPanel({
  project, isLeader, onProjectChange, initial,
}) {
  const [tab, setTab] = useState(initial || 'members');
  return (
    <div>
      <div className="view-switch settings-tabs" role="tablist" style={{ marginBottom: 14 }}>
        {[
          { key: 'members', label: '👥 Thành viên' },
          isLeader && { key: 'invite', label: '✉️ Mời thành viên' },
          { key: 'profile', label: '👤 Thông tin cá nhân' },
          { key: 'appearance', label: '🎨 Giao diện' },
          isLeader && { key: 'project', label: '🛠 Dự án' },
        ].filter(Boolean).map((t) => (
          <button type="button" key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === 'members' && <MembersTab project={project} isLeader={isLeader} onChange={onProjectChange} part="list" />}
      {tab === 'invite' && isLeader && <MembersTab project={project} isLeader={isLeader} onChange={onProjectChange} part="invite" />}
      {tab === 'profile' && <Profile />}
      {tab === 'appearance' && <AppearanceSettings />}
      {tab === 'project' && isLeader && <ProjectSettings project={project} onChange={onProjectChange} />}
    </div>
  );
}
