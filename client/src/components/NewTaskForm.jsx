import { useState } from 'react';
import api, { errMsg } from '../api/client';
import AssigneePicker from './AssigneePicker';
import LabelPicker from './LabelPicker';
import { formatDeadline } from './taskMeta';

const EMPTY = {
  title: '', description: '', assigneeIds: [], labelIds: [], priority: 'medium', startDate: '', dueDate: '', dueTime: '',
};

// Thiết lập công việc mới: tên, người làm, nhãn, ngày bắt đầu, hạn nộp (ngày + giờ)
export default function NewTaskForm({ project, onCreated, onOpenTask }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState([]);
  const workers = project.members.filter((m) => m.role !== 'guest');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api.post(`/projects/${project.id}/tasks`, form);
      setCreated((list) => [{ ...res.data, assigneeIds: form.assigneeIds }, ...list].slice(0, 5));
      setForm({ ...EMPTY, startDate: form.startDate });
      onCreated?.();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (id) => workers.find((m) => m.id === id)?.fullName;

  return (
    <div className="new-task-page">
      <form className="card new-task-form" onSubmit={submit}>
        {error && <div className="alert">{error}</div>}
        <label>Tên công việc *
          <input required maxLength={200} placeholder="VD: Vẽ sơ đồ ERD cơ sở dữ liệu" value={form.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <div className="form-grid">
          <label>Giao cho (chọn được nhiều người)
            <AssigneePicker members={workers} value={form.assigneeIds} onChange={(ids) => set({ assigneeIds: ids })} placeholder="Chưa giao (ai bấm Bắt đầu sẽ nhận)" />
          </label>
          <label>Nhãn
            <LabelPicker labels={project.labels || []} value={form.labelIds} onChange={(ids) => set({ labelIds: ids })} />
          </label>
          <label>Thời gian bắt đầu
            <input type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          </label>
          <label>Hạn nộp – ngày và giờ
            <span className="row" style={{ flexWrap: 'nowrap' }}>
              <input type="date" className="grow" min={form.startDate || undefined} value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value, dueTime: e.target.value ? form.dueTime : '' })} />
              <input type="time" disabled={!form.dueDate} value={form.dueTime} onChange={(e) => set({ dueTime: e.target.value })} />
            </span>
            <small className="muted">Bỏ trống giờ = hết hạn lúc 23:59 ngày đó</small>
          </label>
          <label className="span2">Mô tả (không bắt buộc)
            <textarea rows={3} placeholder="Yêu cầu, tài liệu tham khảo..." value={form.description} onChange={(e) => set({ description: e.target.value })} />
          </label>
        </div>
        <div className="row between">
          <label className="check urgent-check">
            <input type="checkbox" checked={form.priority === 'urgent'} onChange={(e) => set({ priority: e.target.checked ? 'urgent' : 'medium' })} />
            🚨 Đánh dấu khẩn cấp
          </label>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Đang tạo…' : '+ Tạo công việc'}</button>
        </div>
      </form>

      {created.length > 0 && (
        <div className="card">
          <h3>Vừa tạo</h3>
          <ul className="created-list">
            {created.map((t) => (
              <li key={t.id}>
                <button type="button" className="link" onClick={() => onOpenTask(t.id)}>{t.title}</button>
                <small className="muted">
                  {t.assigneeIds.length ? ` · ${t.assigneeIds.map(nameOf).join(', ')}` : ' · chưa giao'}
                  {t.dueDate && ` · hạn ${formatDeadline(t)}`}
                </small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
