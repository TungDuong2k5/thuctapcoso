import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import TaskModal from './TaskModal';
import { useAuth } from '../context/AuthContext';
import { assigneeNames } from './AssigneePicker';
import { LabelChips } from './LabelPicker';
import Avatar from './Avatar';
import useTasks from '../hooks/useTasks';
import {
  COLUMNS, LOCKED, isOverdue, viDate, formatDeadline, isUrgentTask, lateLabel, taskPercent, taskPace,
} from './taskMeta';

// Giữ export cũ để các file khác vẫn import từ './Board' được
export {
  COLUMNS, LOCKED, todayISO, isOverdue, viDate,
} from './taskMeta';

const NO_FILTER = {
  q: '', assigneeId: '', labelId: '', priority: '',
};

// Màn hình chính của dự án: bảng Kanban (tạo việc, danh sách, lịch... nằm trong menu ☰)
export default function Board({ project, isLeader, isGuest }) {
  const { user } = useAuth();
  const [filter, setFilter] = useState(NO_FILTER);
  const { tasks, reload: load } = useTasks(project.id, filter);
  const [dragId, setDragId] = useState(null);
  const [error, setError] = useState('');
  const [params, setParams] = useSearchParams();
  const openTaskId = params.get('task');

  const drop = async (status, position) => {
    if (!dragId) return;
    setError('');
    const dragged = tasks.find((t) => t.id === dragId);
    // Kiểm tra trước ở giao diện cho nhanh; server vẫn kiểm tra lại cùng các luật này
    const block = (msg) => { setError(msg); setDragId(null); };
    const WORK = ['todo', 'in_progress'];
    if (!dragged || status === dragged.status) {
      // đổi thứ tự trong cùng cột: luôn được
    } else if (status === 'review') {
      return block('Mở công việc và gửi báo cáo kèm file, công việc sẽ tự chuyển sang Review.');
    } else if (status === 'done') {
      return block('Mở công việc ở cột Review và bấm "Đạt" trong phần nhận xét để chuyển sang Done.');
    } else if (dragged.status === 'review') {
      return block('Bài đang chờ nhận xét: người nhận xét bấm "Chưa đạt" để trả lại kèm góp ý.');
    } else if (dragged.status === 'done' && !isLeader) {
      return block('Chỉ trưởng nhóm được mở lại công việc đã Done.');
    } else if (WORK.includes(status) && dragged.assignees?.length && !dragged.assignees.some((a) => a.id === user.id)) {
      return block(`Chỉ ${assigneeNames(dragged, 5)} mới bắt đầu làm công việc này.`);
    }
    try {
      await api.patch(`/tasks/${dragId}/move`, { status, position });
    } catch (err) {
      setError(errMsg(err));
    }
    setDragId(null);
    load();
  };

  // Đóng chi tiết công việc thì đóng luôn khung nhắn riêng
  const openTask = (id) => setParams((p) => {
    const next = new URLSearchParams(p);
    if (id) next.set('task', id);
    else { next.delete('task'); next.delete('dm'); }
    return next;
  });
  const workers = project.members.filter((m) => m.role !== 'guest');
  // Thành viên chỉ thấy việc của mình; trưởng nhóm theo dõi tiến độ cả nhóm
  const isMember = !isLeader && !isGuest;
  const hasFilter = Object.values(filter).some(Boolean);

  return (
    <div>
      <div className="toolbar">
        <div className="row">
          <input placeholder="🔍 Tìm công việc..." value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
          {!isMember && (
            <select value={filter.assigneeId} onChange={(e) => setFilter({ ...filter, assigneeId: e.target.value })}>
              <option value="">Mọi người</option>
              <option value="none">Chưa giao</option>
              {workers.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
            </select>
          )}
          <select value={filter.labelId} onChange={(e) => setFilter({ ...filter, labelId: e.target.value })}>
            <option value="">Mọi nhãn</option>
            {(project.labels || []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <label className="check urgent-check">
            <input type="checkbox" checked={filter.priority === 'urgent'} onChange={(e) => setFilter({ ...filter, priority: e.target.checked ? 'urgent' : '' })} />
            Chỉ việc khẩn cấp
          </label>
          {hasFilter && <button type="button" className="link" onClick={() => setFilter(NO_FILTER)}>Bỏ lọc</button>}
        </div>
      </div>
      {error && <div className="alert">{error}</div>}

      {isMember && <p className="muted small">Bạn đang xem <strong>công việc của mình</strong>.</p>}
      {!isGuest && <PendingReviews tasks={tasks} members={project.members} me={user} isLeader={isLeader} onOpen={openTask} />}
      <div className="board">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.key);
          return (
            <div
              key={col.key}
              className="column"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(col.key, items.length)}
            >
              <div className="column-head">
                <span>{col.label}{LOCKED.includes(col.key) && <small className="lock" title="Vào bằng nút Gửi báo cáo / Đạt"> 🔒</small>}</span>
                <span className="muted">{items.length}</span>
              </div>
              {items.map((t, index) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  dragging={dragId === t.id}
                  draggable={!isGuest}
                  onDragStart={() => setDragId(t.id)}
                  onDragEnd={() => setDragId(null)}
                  onDrop={() => drop(col.key, index)}
                  onOpen={() => openTask(t.id)}
                />
              ))}
            </div>
          );
        })}
      </div>

      {openTaskId && (
        <TaskModal
          taskId={openTaskId}
          project={project}
          isLeader={isLeader}
          isGuest={isGuest}
          onClose={() => openTask(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function TaskCard({
  task: t, dragging, draggable, onDragStart, onDragEnd, onDrop, onOpen,
}) {
  const overdue = isOverdue(t);
  const late = lateLabel(t);
  return (
    <div
      className={`task-card ${isUrgentTask(t) ? 'prio-border-urgent' : ''} ${dragging ? 'dragging' : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.stopPropagation(); onDrop(); }}
      onClick={onOpen}
    >
      <LabelChips labels={t.labels} />
      <div className="task-title">{t.title}</div>
      <div className="task-meta">
        {isUrgentTask(t) && <span className="prio urgent">🚨 Khẩn cấp</span>}
        {(t.startDate || t.dueDate) && (
          <span className={overdue ? 'overdue' : 'muted'} title="Bắt đầu → Hạn nộp">
            {overdue && 'Quá hạn '}
            {t.startDate && !t.dueDate && `Từ ${viDate(t.startDate).slice(0, 5)}`}
            {t.startDate && t.dueDate && `${viDate(t.startDate).slice(0, 5)} → `}
            {t.dueDate && formatDeadline(t, true)}
          </span>
        )}
      </div>
      {['in_progress', 'review'].includes(t.status) && (
        <div className="card-progress" title="Mức hoàn thành">
          <div className="mp-bar"><div className={`fill tone-${taskPace(t)}`} style={{ width: `${taskPercent(t)}%` }} /></div>
          <small>{taskPercent(t)}%</small>
        </div>
      )}
      {late && <div className="late-badge">⏱ {late}</div>}
      <div className="row between muted small">
        <span className="card-assignees" title={(t.assignees || []).map((a) => a.fullName).join(', ')}>
          {(t.assignees || []).slice(0, 3).map((a) => <Avatar key={a.id} name={a.fullName} src={a.avatarUrl} size={20} />)}
          <span>{assigneeNames(t)}</span>
        </span>
        <span className="row" style={{ gap: 8 }}>
          {t.dmUnread > 0 && <span className="dm-card-badge" title={`${t.dmUnread} tin nhắn riêng chưa đọc`}>💬 {t.dmUnread}</span>}
          {t.attachments?.length > 0 && <span title="Số file đã nộp">📎 {t.attachments.length}</span>}
        </span>
      </div>
    </div>
  );
}

// Các bài đang ở Review mà mình là người nhận xét
function PendingReviews({
  tasks, members, me, isLeader, onOpen,
}) {
  const roleOf = (id) => members.find((m) => m.id === id)?.role;
  const pending = tasks.filter((t) => {
    const ids = (t.assignees || []).map((a) => a.id);
    return t.status === 'review' && !ids.includes(me.id) && (ids.some((id) => roleOf(id) === 'leader') || isLeader);
  });
  if (!pending.length) return null;
  return (
    <div className="card pending-card">
      <strong>Bài cần bạn nhận xét ({pending.length})</strong>
      <div className="pending-list">
        {pending.map((t) => (
          <button type="button" key={t.id} className="pending-item" onClick={() => onOpen(t.id)}>
            <span>{t.title}</span>
            <small className="muted">
              {assigneeNames(t, 3)}
              {t.submittedAt ? ` · gửi lúc ${new Date(t.submittedAt).toLocaleString('vi-VN')}` : ' · đang chờ nhận xét'}
            </small>
          </button>
        ))}
      </div>
    </div>
  );
}
