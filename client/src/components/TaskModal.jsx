import { useCallback, useEffect, useRef, useState } from 'react';
import api, {
  downloadAttachment, errMsg, formatSize, getSocket,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  COLUMNS, deadlineOf, formatDeadline, lateLabel, taskPercent, taskPace,
} from './taskMeta';
import AssigneePicker, { assigneeNames } from './AssigneePicker';
import LabelPicker, { LabelChips } from './LabelPicker';
import MentionInput, { renderMentions } from './MentionInput';
import DirectMessages from './DirectMessages';

const MAX_FILES = 10;
const MAX_MB = 25;

function fileExt(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toUpperCase().slice(0, 4) : 'FILE';
}

export default function TaskModal({
  taskId, project, isLeader, isGuest, onClose, onChanged,
}) {
  const { user } = useAuth();
  const [task, setTask] = useState(null);
  const [form, setForm] = useState(null);
  const [comment, setComment] = useState('');
  const [mentions, setMentions] = useState([]);
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
          title: t.title,
          description: t.description || '',
          priority: t.priority,
          startDate: t.startDate || '',
          dueDate: t.dueDate || '',
          dueTime: t.dueTime || '',
          assigneeIds: (t.assignees || []).map((a) => a.id),
          labelIds: (t.labels || []).map((l) => l.id),
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

  // Người làm kéo thanh "Mức hoàn thành" (10–90%), thả tay là lưu
  const [progressDraft, setProgressDraft] = useState(null);
  const saveProgress = async (value) => {
    setError('');
    try {
      await api.put(`/tasks/${taskId}`, { progress: value });
      onChanged();
      load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setProgressDraft(null);
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
    setError('');
    // chỉ gửi những người còn được @nhắc trong nội dung
    const mentionIds = mentions.filter((m) => comment.includes(`@${m.fullName}`)).map((m) => m.id);
    try {
      await api.post(`/tasks/${taskId}/comments`, { content: comment, mentionIds });
      setComment('');
      setMentions([]);
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  };


  const readOnly = !!isGuest;
  const canDelete = task && !readOnly && (isLeader || task.creatorId === user.id);
  const pastDeadline = task?.dueDate && deadlineOf(task) < new Date();
  const late = task ? lateLabel(task) : '';
  const others = project.members.filter((m) => m.id !== user.id);
  const isDone = task?.status === 'done';
  // Người làm: người được giao (việc chưa giao thì ai bấm Bắt đầu sẽ nhận việc)
  const assigneeIds = task ? (task.assignees || []).map((a) => a.id) : [];
  const isWorker = task && (assigneeIds.length ? assigneeIds.includes(user.id) : true);
  const canWork = task && !readOnly && ['todo', 'in_progress'].includes(task.status) && isWorker;
  // Bài thành viên → trưởng nhóm nhận xét; bài trưởng nhóm → các thành viên khác nhận xét
  const leaderWorks = assigneeIds.some((id) => project.members.find((m) => m.id === id)?.role === 'leader');
  const canReview = task && !readOnly && task.status === 'review' && !assigneeIds.includes(user.id) && (leaderWorks || isLeader);
  const reviewerLabel = leaderWorks ? 'các thành viên' : 'trưởng nhóm';
  const waitingFor = task && (!isWorker || readOnly) && ['todo', 'in_progress'].includes(task.status);

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
              <div className="row">
                <DirectMessages task={task} readOnly={readOnly} />
                <button type="button" className="btn ghost" onClick={onClose}>Đóng</button>
              </div>
            </div>
            <input className="title-input" disabled={readOnly} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <LabelChips labels={task.labels} small={false} />
            {task.dueDate && (
              <div className={`deadline-line ${pastDeadline && !['done', 'review'].includes(task.status) ? 'overdue' : ''}`}>
                ⏰ Hạn nộp: <strong>{task.dueTime || '23:59'} ngày {formatDeadline({ dueDate: task.dueDate })}</strong>
                {pastDeadline && !['done', 'review'].includes(task.status) && ' — ĐÃ QUÁ HẠN'}
                {task.submittedAt && (late
                  ? <span className="late-badge">⏱ {late}</span>
                  : <span className="ontime-badge">✓ Nộp đúng hạn</span>)}
              </div>
            )}
            {readOnly && <div className="status-banner">Bạn là <strong>khách</strong> của dự án này nên chỉ được xem.</div>}

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

            {/* Mức hoàn thành: người làm tự cập nhật khi đang In progress */}
            <div className="task-progress">
              <div className="row between">
                <strong>Mức hoàn thành</strong>
                <strong className={`tone-text-${taskPace(task)}`}>{progressDraft ?? taskPercent(task)}%</strong>
              </div>
              <div className="mp-bar"><div className={`fill tone-${taskPace(task)}`} style={{ width: `${progressDraft ?? taskPercent(task)}%` }} /></div>
              {canWork && task.status === 'in_progress' ? (
                <>
                  <input
                    type="range"
                    min={10}
                    max={90}
                    step={5}
                    value={progressDraft ?? taskPercent(task)}
                    onChange={(e) => setProgressDraft(Number(e.target.value))}
                    onMouseUp={(e) => saveProgress(Number(e.target.value))}
                    onTouchEnd={(e) => saveProgress(Number(e.target.value))}
                    onKeyUp={(e) => saveProgress(Number(e.target.value))}
                  />
                  <small className="muted">Kéo để báo bạn đã làm được bao nhiêu (tối đa 90%). Gửi báo cáo → 90%, được duyệt Đạt → 100%.</small>
                </>
              ) : (
                <small className="muted">
                  {{
                    todo: 'Chưa bắt đầu (0%).',
                    in_progress: 'Người làm đang cập nhật mức hoàn thành.',
                    review: 'Đã nộp bài, chờ nhận xét (90%).',
                    done: 'Đã được duyệt Đạt (100%).',
                  }[task.status]}
                </small>
              )}
            </div>

            {/* Gửi báo cáo (chỉ khi đang In progress) → tự sang Review */}
            {canWork && task.status === 'in_progress' && (
              <div
                className="dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); pickFiles(e.dataTransfer.files); }}
              >
                <strong>Gửi báo cáo (bắt buộc kèm file) → tự chuyển sang Review</strong>
                {pastDeadline && (
                  <div className="alert small">Đã quá hạn nộp ({formatDeadline(task)}). Bạn vẫn gửi được nhưng bài sẽ bị ghi <strong>Nộp muộn</strong>.</div>
                )}
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
                  {!readOnly && (att.uploaderId === user.id || isLeader) && (
                    <button type="button" className="link danger-text" onClick={() => removeFile(att)}>Xóa</button>
                  )}
                </li>
              ))}
            </ul>

            <h4>Thông tin</h4>
            <fieldset className="plain" disabled={readOnly}>
              <div className="form-grid">
                <label className="span2">Người làm (chọn được nhiều người)
                  <AssigneePicker
                    members={project.members.filter((m) => m.role !== 'guest')}
                    value={form.assigneeIds}
                    onChange={(ids) => setForm({ ...form, assigneeIds: ids })}
                  />
                </label>
                <label>Nhãn
                  <LabelPicker labels={project.labels || []} value={form.labelIds} onChange={(ids) => setForm({ ...form, labelIds: ids })} />
                </label>
                <label>Mức độ
                  <span className="check urgent-check">
                    <input type="checkbox" checked={form.priority === 'urgent'} onChange={(e) => setForm({ ...form, priority: e.target.checked ? 'urgent' : 'medium' })} />
                    🚨 Khẩn cấp
                  </span>
                </label>
                <label>Ngày bắt đầu
                  <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                </label>
                <label>Hạn nộp (ngày + giờ)
                  <span className="row" style={{ flexWrap: 'nowrap' }}>
                    <input type="date" className="grow" min={form.startDate || undefined} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value, dueTime: e.target.value ? form.dueTime : '' })} />
                    <input type="time" title="Bỏ trống = 23:59" disabled={!form.dueDate} value={form.dueTime} onChange={(e) => setForm({ ...form, dueTime: e.target.value })} />
                  </span>
                </label>
                <label className="span2">Người tạo<input disabled value={task.creator?.fullName || ''} /></label>
                <label className="span2">Mô tả
                  <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </label>
              </div>
            </fieldset>
            {!readOnly && (
              <div className="row end">
                {canDelete && <button type="button" className="btn danger" onClick={remove}>Xóa công việc</button>}
                <button type="button" className="btn primary" onClick={save}>Lưu thay đổi</button>
              </div>
            )}

            <h4>Bình luận</h4>
            <div className="comments">
              {task.comments.length === 0 && <p className="muted small">Chưa có bình luận</p>}
              {task.comments.map((c) => (
                <div key={c.id} className="comment">
                  <strong>{c.author?.fullName}</strong> <small className="muted">{new Date(c.createdAt).toLocaleString('vi-VN')}</small>
                  <div className="pre-line">{renderMentions(c.content, project.members)}</div>
                </div>
              ))}
            </div>
            {!readOnly && (
              <form className="row" onSubmit={send}>
                <MentionInput
                  members={others}
                  value={comment}
                  onChange={setComment}
                  onMention={(m) => setMentions((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]))}
                  placeholder="Viết bình luận... gõ @ để nhắc tên thành viên"
                />
                <button type="submit" className="btn">Gửi</button>
              </form>
            )}

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
