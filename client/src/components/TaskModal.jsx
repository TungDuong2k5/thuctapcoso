import { useCallback, useEffect, useRef, useState } from 'react';
import api, {
  downloadAttachment, errMsg, formatSize, getSocket,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { COLUMNS, PRIORITY_LABEL } from './Board';
import AssigneePicker, { assigneeNames } from './AssigneePicker';

const MAX_FILES = 10;
const MAX_MB = 25;

function fileExt(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toUpperCase().slice(0, 4) : 'FILE';
}

export default function TaskModal({ taskId, project, isLeader, onClose, onChanged }) {
  const { user } = useAuth();
  const [task, setTask] = useState(null);
  const [form, setForm] = useState(null);
  const [comment, setComment] = useState('');
  const [files, setFiles] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({ goodPoints: '', improvements: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const fileInput = useRef(null);

  const load = useCallback(() => {
    api.get(`/tasks/${taskId}`)
      .then((res) => {
        const t = res.data;
        setTask(t);
        setForm({
          title: t.title, description: t.description || '', priority: t.priority, dueDate: t.dueDate || '', assigneeIds: (t.assignees || []).map((a) => a.id),
        });
      })
      .catch((err) => setError(errMsg(err)));
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const onEvent = (payload) => String(payload.taskId ?? payload.id) === String(taskId) && load();
    socket.on('comment:new', onEvent);
    socket.on('task:changed', onEvent);
    return () => {
      socket.off('comment:new', onEvent);
      socket.off('task:changed', onEvent);
    };
  }, [taskId, load]);

  const flash = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(''), 3000);
  };

  const save = async () => {
    setError('');
    try {
      await api.put(`/tasks/${taskId}`, form);
      onChanged();
      load();
      flash('Đã lưu thay đổi');
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const pickFiles = (list) => {
    setError('');
    const picked = [...files, ...Array.from(list)].slice(0, MAX_FILES);
    const tooBig = picked.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (tooBig) {
      setError(`"${tooBig.name}" lớn hơn ${MAX_MB}MB`);
      return;
    }
    setFiles(picked);
  };

  // Gửi bài: bắt buộc có file, công việc ở In progress và báo trưởng nhóm
  const sendWork = async () => {
    if (!files.length) {
      setError('Hãy chọn ít nhất một file');
      return;
    }
    setBusy(true);
    setError('');
    const data = new FormData();
    files.forEach((f) => data.append('files', f));
    if (note.trim()) data.append('note', note.trim());
    try {
      await api.post(`/tasks/${taskId}/submit`, data);
      setFiles([]);
      setNote('');
      onChanged();
      load();
      flash('Đã gửi báo cáo, công việc chuyển sang Review và người nhận xét đã được thông báo');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const startWork = async () => {
    setError('');
    try {
      await api.patch(`/tasks/${taskId}/move`, { status: 'in_progress' });
      onChanged();
      load();
      flash('Đã chuyển sang In progress');
    } catch (err) {
      setError(errMsg(err));
    }
  };

  // Người nhận xét: comment = chỉ góp ý, approve = Đạt → Done, reject = Chưa đạt → In progress
  const review = async (decision) => {
    setError('');
    try {
      await api.post(`/tasks/${taskId}/review`, { decision, ...feedback });
      setFeedback({ goodPoints: '', improvements: '' });
      onChanged();
      load();
      flash({
        comment: 'Đã gửi nhận xét',
        approve: 'Bài đã Đạt và chuyển sang Done, người làm đã nhận được nhận xét',
        reject: 'Đã trả lại, người làm đã nhận được nhận xét',
      }[decision]);
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const removeFile = async (att) => {
    if (!window.confirm(`Xóa file "${att.originalName}"?`)) return;
    try {
      await api.delete(`/attachments/${att.id}`);
      load();
      onChanged();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const download = async (att) => {
    try {
      await downloadAttachment(att);
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const remove = async () => {
    if (!window.confirm('Xóa công việc này?')) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      onChanged();
      onClose();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const send = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    await api.post(`/tasks/${taskId}/comments`, { content: comment });
    setComment('');
    load();
  };

  const canDelete = task && (isLeader || task.creatorId === user.id);
  const isDone = task?.status === 'done';
  // Người làm: người được giao (việc chưa giao thì ai bấm Bắt đầu sẽ nhận việc)
  const assigneeIds = task ? (task.assignees || []).map((a) => a.id) : [];
  const isWorker = task && (assigneeIds.length ? assigneeIds.includes(user.id) : true);
  const canWork = task && ['todo', 'in_progress'].includes(task.status) && isWorker;
  // Bài thành viên → trưởng nhóm nhận xét; bài trưởng nhóm → các thành viên khác nhận xét
  const leaderWorks = assigneeIds.some((id) => project.members.find((m) => m.id === id)?.role === 'leader');
  const canReview = task && task.status === 'review' && !assigneeIds.includes(user.id) && (leaderWorks || isLeader);
  const reviewerLabel = leaderWorks ? 'các thành viên' : 'trưởng nhóm';
  const waitingFor = task && !isWorker && ['todo', 'in_progress'].includes(task.status);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {!task && !error && <p className="muted">Đang tải...</p>}
        {error && <div className="alert">{error}</div>}
        {message && <div className="info">{message}</div>}
        {task && form && (
          <>
            <div className="row between">
              <span className={`tag status-${task.status}`}>{COLUMNS.find((c) => c.key === task.status)?.label}</span>
              <button type="button" className="btn ghost" onClick={onClose}>Đóng</button>
            </div>
            <input className="title-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />

            {task.status === 'todo' && canWork && (
              <div className="status-banner">
                <span>Chưa bắt đầu. Bấm <strong>Bắt đầu</strong> khi bạn bắt đầu làm để nhóm biết.</span>
                <button type="button" className="btn primary" onClick={startWork}>Bắt đầu</button>
              </div>
            )}
            {task.status === 'review' && !canReview && (
              <div className="status-banner review">
                {assigneeIds.includes(user.id)
                  ? `Đã gửi báo cáo lúc ${new Date(task.submittedAt).toLocaleString('vi-VN')}, đang chờ ${reviewerLabel} nhận xét.`
                  : `Bài đang chờ ${reviewerLabel} nhận xét.`}
              </div>
            )}
            {isDone && <div className="status-banner done">Bài đã Đạt và hoàn thành.</div>}
            {waitingFor && (
              <div className="status-banner">
                {`Đang chờ ${assigneeIds.length ? assigneeNames(task, 5) : 'người làm'} ${task.status === 'todo' ? 'bắt đầu làm' : 'gửi báo cáo'}.`}
              </div>
            )}

            {task.reviews?.length > 0 && (
              <div className="reviews">
                <h4>Nhận xét</h4>
                {task.reviews.map((r) => (
                  <div key={r.id} className={`review-item decision-${r.decision}`}>
                    <div className="row between">
                      <strong>{{ start: 'Đã nhận bài', comment: 'Góp ý', approve: 'Đạt', reject: 'Chưa đạt – cần sửa' }[r.decision]}</strong>
                      <small className="muted">{r.reviewer?.fullName} · {new Date(r.createdAt).toLocaleString('vi-VN')}</small>
                    </div>
                    {r.goodPoints && <div className="pre-line"><span className="fb-label ok">Ổn</span>{r.goodPoints}</div>}
                    {r.improvements && <div className="pre-line"><span className="fb-label fix">Cần bổ sung</span>{r.improvements}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* Review: người nhận xét góp ý rồi xét Đạt / Chưa đạt */}
            {canReview && (
              <div className="review-panel">
                <strong>Nhận xét bài của {assigneeNames(task, 5)}</strong>
                <p className="muted small">
                  Tải các file bên dưới về xem. Viết phần ổn và phần cần bổ sung, rồi chọn: chỉ gửi góp ý,
                  Chưa đạt (trả lại để sửa, bắt buộc ghi phần cần bổ sung) hoặc Đạt (chuyển sang Done).
                </p>
                <label>Phần làm tốt / ổn
                  <textarea rows={2} placeholder="VD: Bố cục rõ ràng, sơ đồ đúng chuẩn" value={feedback.goodPoints} onChange={(e) => setFeedback({ ...feedback, goodPoints: e.target.value })} />
                </label>
                <label>Cần bổ sung / hoàn thiện
                  <textarea rows={2} placeholder="VD: Thiếu bảng weekly_reports, cần thêm khóa ngoại" value={feedback.improvements} onChange={(e) => setFeedback({ ...feedback, improvements: e.target.value })} />
                </label>
                <div className="row end">
                  <button type="button" className="btn" onClick={() => review('comment')}>Chỉ gửi góp ý</button>
                  <button type="button" className="btn danger" onClick={() => review('reject')}>Chưa đạt – trả lại</button>
                  <button type="button" className="btn success" onClick={() => review('approve')}>Đạt – Done</button>
                </div>
              </div>
            )}

            {/* Gửi báo cáo (chỉ khi đang In progress) → tự sang Review */}
            {canWork && task.status === 'in_progress' && (
              <div
                className="dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); pickFiles(e.dataTransfer.files); }}
              >
                <strong>Gửi báo cáo (bắt buộc kèm file) → tự chuyển sang Review</strong>
                <p className="muted small">
                  Kéo thả file vào đây hoặc bấm chọn. Nhận Word, PDF, Excel, PowerPoint, ảnh, zip/rar, mã nguồn…
                  (tối đa {MAX_FILES} file, mỗi file {MAX_MB}MB).
                </p>
                <input ref={fileInput} type="file" multiple hidden onChange={(e) => { pickFiles(e.target.files); e.target.value = ''; }} />
                <button type="button" className="btn" onClick={() => fileInput.current.click()}>Chọn file…</button>
                {files.length > 0 && (
                  <ul className="file-list">
                    {files.map((f, i) => (
                      <li key={`${f.name}-${i}`}>
                        <span className="file-ext">{fileExt(f.name)}</span>
                        <span className="grow">{f.name}</span>
                        <small className="muted">{formatSize(f.size)}</small>
                        <button type="button" className="link" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Bỏ</button>
                      </li>
                    ))}
                  </ul>
                )}
                <input className="full" placeholder="Ghi chú cho trưởng nhóm (không bắt buộc)" value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="row end">
                  <button type="button" className="btn primary" disabled={busy || !files.length} onClick={sendWork}>
                    {busy ? 'Đang tải lên…' : 'Gửi báo cáo'}
                  </button>
                </div>
              </div>
            )}

            <h4>File đã gửi ({task.attachments.length})</h4>
            {task.attachments.length === 0 && <p className="muted small">Chưa có file nào</p>}
            <ul className="file-list">
              {task.attachments.map((att) => (
                <li key={att.id}>
                  <span className="file-ext">{fileExt(att.originalName)}</span>
                  <div className="grow">
                    <button type="button" className="link" onClick={() => download(att)}>{att.originalName}</button>
                    <div className="muted small">
                      {att.uploader?.fullName} · {new Date(att.createdAt).toLocaleString('vi-VN')} · {formatSize(att.size)}
                      {att.note && ` · "${att.note}"`}
                    </div>
                  </div>
                  {(att.uploaderId === user.id || isLeader) && (
                    <button type="button" className="link danger-text" onClick={() => removeFile(att)}>Xóa</button>
                  )}
                </li>
              ))}
            </ul>

            <h4>Thông tin</h4>
            <div className="form-grid">
              <label className="span2">Người làm (chọn được nhiều người)
                <AssigneePicker
                  members={project.members}
                  value={form.assigneeIds}
                  onChange={(ids) => setForm({ ...form, assigneeIds: ids })}
                />
              </label>
              <label>Độ ưu tiên
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label>Hạn hoàn thành
                <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </label>
              <label>Người tạo<input disabled value={task.creator?.fullName || ''} /></label>
              <label className="span2">Mô tả
                <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </label>
            </div>
            <div className="row end">
              {canDelete && <button type="button" className="btn danger" onClick={remove}>Xóa công việc</button>}
              <button type="button" className="btn primary" onClick={save}>Lưu thay đổi</button>
            </div>

            <h4>Bình luận</h4>
            <div className="comments">
              {task.comments.length === 0 && <p className="muted small">Chưa có bình luận</p>}
              {task.comments.map((c) => (
                <div key={c.id} className="comment">
                  <strong>{c.author?.fullName}</strong> <small className="muted">{new Date(c.createdAt).toLocaleString('vi-VN')}</small>
                  <div className="pre-line">{c.content}</div>
                </div>
              ))}
            </div>
            <form className="row" onSubmit={send}>
              <input className="grow" placeholder="Viết bình luận..." value={comment} onChange={(e) => setComment(e.target.value)} />
              <button type="submit" className="btn">Gửi</button>
            </form>

            <h4>Lịch sử</h4>
            <ul className="logs">
              {task.logs.map((l) => (
                <li key={l.id}>
                  <small className="muted">{new Date(l.createdAt).toLocaleString('vi-VN')}</small> {l.actor?.fullName}: {l.detail}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
