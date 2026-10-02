import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { errMsg, getSocket } from '../api/client';
import TaskModal from './TaskModal';
import { useAuth } from '../context/AuthContext';
import AssigneePicker, { assigneeNames } from './AssigneePicker';
import Avatar from './Avatar';

export const COLUMNS = [
  { key: 'todo', label: 'To do' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
];
export const PRIORITY_LABEL = { low: 'Thấp', medium: 'Vừa', high: 'Cao' };
// Hai cột chỉ vào được bằng nút (Gửi báo cáo / Đạt), không kéo thả tay
export const LOCKED = ['review', 'done'];

const today = () => new Date().toISOString().slice(0, 10);

export default function Board({ project, isLeader }) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState({ q: '', assigneeId: '' });
  const [newTask, setNewTask] = useState({ title: '', assigneeIds: [], priority: 'medium', dueDate: '' });
  const [dragId, setDragId] = useState(null);
  const [error, setError] = useState('');
  const [params, setParams] = useSearchParams();
  const openTaskId = params.get('task');

  const load = useCallback(() => {
    const query = {};
    if (filter.q) query.q = filter.q;
    if (filter.assigneeId) query.assigneeId = filter.assigneeId;
    api.get(`/projects/${project.id}/tasks`, { params: query }).then((res) => setTasks(res.data));
  }, [project.id, filter]);

  useEffect(() => { load(); }, [load]);

  // Người khác thay đổi task → tải lại bảng ngay
  useEffect(() => {
    const socket = getSocket();
    socket.on('task:changed', load);
    return () => socket.off('task:changed', load);
  }, [load]);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/projects/${project.id}/tasks`, newTask);
      setNewTask({ ...newTask, title: '', dueDate: '', assigneeIds: [] });
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  };

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

  const openTask = (id) => setParams(id ? { task: id } : {});

  return (
    <div>
      <div className="toolbar">
        <form className="row" onSubmit={create}>
          <input placeholder="Tên công việc mới..." required value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} />
          <AssigneePicker
            members={project.members}
            value={newTask.assigneeIds}
            onChange={(ids) => setNewTask({ ...newTask, assigneeIds: ids })}
            placeholder="Giao cho... (chọn được nhiều người)"
          />
          <select value={newTask.priority} onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}>
            {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>Ưu tiên {v}</option>)}
          </select>
          <input type="date" value={newTask.dueDate} onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })} />
          <button type="submit" className="btn primary">Thêm</button>
        </form>
        <div className="row">
          <input placeholder="Tìm kiếm..." value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
          <select value={filter.assigneeId} onChange={(e) => setFilter({ ...filter, assigneeId: e.target.value })}>
            <option value="">Tất cả mọi người</option>
            <option value="none">Chưa giao</option>
            {project.members.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
          </select>
        </div>
      </div>
      {error && <div className="alert">{error}</div>}
      <p className="muted small">
        Quy trình: bấm <strong>Bắt đầu</strong> → In progress · <strong>Gửi báo cáo</strong> kèm file → tự sang Review ·
        bài thành viên do trưởng nhóm nhận xét, bài trưởng nhóm do các thành viên nhận xét → Đạt (Done) hoặc Chưa đạt (làm lại).
      </p>
      <PendingReviews tasks={tasks} members={project.members} me={user} isLeader={isLeader} onOpen={openTask} />

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
              {items.map((t, index) => {
                const overdue = t.status !== 'done' && t.dueDate && t.dueDate < today();
                return (
                  <div
                    key={t.id}
                    className={`task-card ${dragId === t.id ? 'dragging' : ''}`}
                    draggable
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => setDragId(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.stopPropagation(); drop(col.key, index); }}
                    onClick={() => openTask(t.id)}
                  >
                    <div className="task-title">{t.title}</div>
                    <div className="task-meta">
                      <span className={`prio ${t.priority}`}>{PRIORITY_LABEL[t.priority]}</span>
                      {t.dueDate && <span className={overdue ? 'overdue' : 'muted'}>{overdue ? 'Quá hạn ' : 'Hạn '}{t.dueDate}</span>}
                    </div>
                    <div className="row between muted small">
                      <span className="card-assignees" title={(t.assignees || []).map((a) => a.fullName).join(', ')}>
                        {(t.assignees || []).slice(0, 3).map((a) => <Avatar key={a.id} name={a.fullName} size={20} />)}
                        <span>{assigneeNames(t)}</span>
                      </span>
                      {t.attachments?.length > 0 && <span title="Số file đã nộp">📎 {t.attachments.length}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {openTaskId && (
        <TaskModal taskId={openTaskId} project={project} isLeader={isLeader} onClose={() => openTask(null)} onChanged={load} />
      )}
    </div>
  );
}

// Các bài đang ở Review mà mình là người nhận xét
function PendingReviews({ tasks, members, me, isLeader, onOpen }) {
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
