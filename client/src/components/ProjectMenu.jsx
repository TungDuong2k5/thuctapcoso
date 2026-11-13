import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from './Layout';
import useTasks from '../hooks/useTasks';
import NewTaskForm from './NewTaskForm';
import ListView from './ListView';
import CalendarView from './CalendarView';
import ProgressReport from './ProgressReport';
import MembersTab from './MembersTab';
import ProjectSettings from './ProjectSettings';

// Các nút của dự án ở đầu trang (bấm vào mới mở nội dung toàn màn hình)
function menuItems({ isGuest, isLeader }) {
  return [
    !isGuest && { key: 'new', icon: 'plus', short: 'Việc mới', emoji: '➕', title: 'Thiết lập công việc mới' },
    { key: 'list', icon: 'list', short: 'Danh sách', emoji: '📋', title: 'Danh sách công việc' },
    { key: 'calendar', icon: 'calendar', short: 'Lịch', emoji: '📅', title: 'Lịch' },
    { key: 'overview', icon: 'chart', short: 'Tổng quan', emoji: '📊', title: 'Tổng quan dự án' },
    { key: 'settings', icon: 'settings', short: 'Cài đặt', emoji: '⚙️', title: 'Cài đặt dự án' },
    isLeader && { key: 'manage', icon: 'wrench', short: 'Quản lý', emoji: '🛠', title: 'Quản lý dự án' },
  ].filter(Boolean);
}
// Link cũ ?panel=members → mở Cài đặt (phần Thành viên nằm trong Cài đặt)
const ALIAS = { members: 'settings', report: 'overview' };

// Hàng nút của dự án ở đầu trang + khung toàn màn hình khi bấm vào một nút
export default function ProjectMenu({
  project, isLeader, isGuest, onProjectChange,
}) {
  const [params, setParams] = useSearchParams();
  const panel = ALIAS[params.get('panel')] || params.get('panel');
  const items = menuItems({ isGuest, isLeader });
  const current = items.find((i) => i.key === panel);

  const update = (changes) => setParams((p) => {
    const next = new URLSearchParams(p);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    return next;
  });
  const openPanel = (key) => update({ panel: key, menu: null });
  const closePanel = () => update({ panel: null, week: null });

  // Esc: đóng khung toàn màn hình (trừ khi đang mở chi tiết công việc)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !params.get('task') && panel) closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const toolbar = (
    <div className="project-tools">
      {items.map((i) => (
        <button type="button" key={i.key} title={i.title} className={`btn ${i.key === 'new' ? 'primary' : ''}`} onClick={() => openPanel(i.key)}>
          <Icon name={i.icon} size={16} />
          <span>{i.short}</span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      {toolbar}

      {current && (
        <div className="fullscreen" role="dialog" aria-label={current.title}>
          <div className="fullscreen-head">
            <button type="button" className="btn ghost" onClick={closePanel}>← Bảng công việc</button>
            <h2>{current.emoji} {current.title}</h2>
            <button type="button" className="float-close" title="Đóng (Esc)" onClick={closePanel}>×</button>
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
    case 'manage': return <ProjectSettings project={project} onChange={onProjectChange} />;
    case 'settings': return <SettingsPanel project={project} isLeader={isLeader} onProjectChange={onProjectChange} />;
    default: return null;
  }
}

function TasksPanel({ project, render }) {
  const { tasks, loaded } = useTasks(project.id);
  if (!loaded) return <p className="muted">Đang tải...</p>;
  return render(tasks);
}

// Cài đặt: Thành viên + Mời thành viên (chỉ trưởng nhóm)
function SettingsPanel({ project, isLeader, onProjectChange }) {
  const [tab, setTab] = useState('members');
  return (
    <div>
      {isLeader && (
        <div className="view-switch settings-tabs" role="tablist" style={{ marginBottom: 14 }}>
          {[
            { key: 'members', label: '👥 Thành viên' },
            { key: 'invite', label: '✉️ Mời thành viên' },
          ].map((t) => (
            <button type="button" key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
      )}
      <MembersTab project={project} isLeader={isLeader} onChange={onProjectChange} part={tab === 'invite' && isLeader ? 'invite' : 'list'} />
    </div>
  );
}
