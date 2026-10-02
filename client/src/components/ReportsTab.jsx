import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';

const STATUS_LABEL = { draft: 'Nháp', submitted: 'Đã nộp', reviewed: 'Đã nhận xét' };

function mondayOf(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() || 7) - 1));
  return d.toISOString().slice(0, 10);
}

function shiftWeek(iso, weeks) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

function sunday(monday) {
  const d = new Date(`${monday}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

const emptyForm ={ doneText: '', planText: '', issuesText: '' };

export default function ReportsTab({ project, isLeader }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const week = mondayOf(params.get('week') || new Date().toISOString().slice(0, 10));
  const [reports, setReports] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get(`/projects/${project.id}/reports`, { params: { week } }).then((res) => {
      setReports(res.data);
      const mine = res.data.find((r) => r.userId === user.id);
      setForm(mine ? { doneText: mine.doneText || '', planText: mine.planText || '', issuesText: mine.issuesText || '' } : emptyForm);
    });
  }, [project.id, week, user.id]);

  useEffect(() => { load(); setMessage(''); setError(''); }, [load]);

  const mine = reports.find((r) => r.userId === user.id);
  const editable = !mine || mine.status === 'draft';

  const suggest = async () => {
    const res = await api.get(`/projects/${project.id}/reports/suggest`, { params: { week } });
    setForm({
      ...form,
      doneText: form.doneText || res.data.doneText,
      planText: form.planText || res.data.planText,
    });
    setMessage(res.data.doneText ? 'Đã điền gợi ý từ các công việc của bạn' : 'Tuần này bạn chưa có công việc Done nào');
  };

  const save = async (submit) => {
    setError('');
    try {
      await api.post(`/projects/${project.id}/reports`, { ...form, weekStart: week, submit });
      setMessage(submit ? 'Đã nộp báo cáo' : 'Đã lưu nháp');
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const field = (key) => ({ value: form[key], disabled: !editable, onChange: (e) => setForm({ ...form, [key]: e.target.value }) });

  return (
    <div>
      <div className="row week-nav">
        <button type="button" className="btn ghost" onClick={() => setParams({ week: shiftWeek(week, -1) })}>← Tuần trước</button>
        <strong>Tuần {week} → {sunday(week)}</strong>
        <button type="button" className="btn ghost" onClick={() => setParams({ week: shiftWeek(week, 1) })}>Tuần sau →</button>
      </div>

      <div className="card">
        <div className="row between">
          <h3>Báo cáo của tôi</h3>
          {mine && <span className={`tag ${mine.status}`}>{STATUS_LABEL[mine.status]}</span>}
        </div>
        {error && <div className="alert">{error}</div>}
        {message && <div className="info">{message}</div>}
        <label>Đã làm trong tuần<textarea rows={4} {...field('doneText')} /></label>
        <label>Kế hoạch tuần sau<textarea rows={3} {...field('planText')} /></label>
        <label>Khó khăn, vướng mắc<textarea rows={2} {...field('issuesText')} /></label>
        {editable ? (
          <div className="row end">
            <button type="button" className="btn ghost" onClick={suggest}>Gợi ý từ công việc</button>
            <button type="button" className="btn" onClick={() => save(false)}>Lưu nháp</button>
            <button type="button" className="btn primary" onClick={() => save(true)}>Nộp báo cáo</button>
          </div>
        ) : (
          mine?.feedback && <div className="info"><strong>Nhận xét:</strong> {mine.feedback} {mine.score != null && `· Điểm: ${mine.score}`}</div>
        )}
      </div>

      {isLeader && (
        <div className="card">
          <h3>Báo cáo của nhóm</h3>
          <p className="muted small">
            Đã nộp {reports.filter((r) => r.status !== 'draft').length}/{project.members.length} thành viên
          </p>
          {reports.filter((r) => r.status !== 'draft').map((r) => <ReviewItem key={r.id} report={r} onDone={load} />)}
          <p className="muted small">
            Chưa nộp: {project.members
              .filter((m) => !reports.some((r) => r.userId === m.id && r.status !== 'draft'))
              .map((m) => m.fullName).join(', ') || 'không ai'}
          </p>
        </div>
      )}
    </div>
  );
}

function ReviewItem({ report, onDone }) {
  const [feedback, setFeedback] = useState(report.feedback || '');
  const [score, setScore] = useState(report.score ?? '');
  const [error, setError] = useState('');

  const review = async (returnToDraft) => {
    try {
      await api.patch(`/reports/${report.id}/review`, { feedback, score: score === '' ? null : Number(score), returnToDraft });
      onDone();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  return (
    <div className="review-item">
      <div className="row between">
        <strong>{report.author?.fullName}</strong>
        <span className={`tag ${report.status}`}>{STATUS_LABEL[report.status]}</span>
      </div>
      <div className="report-grid">
        <div><small className="muted">Đã làm</small><pre>{report.doneText}</pre></div>
        <div><small className="muted">Kế hoạch</small><pre>{report.planText}</pre></div>
        <div><small className="muted">Khó khăn</small><pre>{report.issuesText}</pre></div>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="row">
        <input className="grow" placeholder="Nhận xét..." value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        <input type="number" min="0" max="10" step="0.5" placeholder="Điểm" style={{ width: 80 }} value={score} onChange={(e) => setScore(e.target.value)} />
        <button type="button" className="btn ghost" onClick={() => review(true)}>Trả lại</button>
        <button type="button" className="btn primary" onClick={() => review(false)}>Lưu nhận xét</button>
      </div>
    </div>
  );
}
