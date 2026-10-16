import { useState } from 'react';
import ReportsTab from './ReportsTab';
import {
  OverviewPeople, ProjectsPerformance, TimelineCharts, useOverview,
} from '../pages/Overview';

const TABS = [
  { key: 'all', label: '🌐 Hiệu suất qua tất cả dự án' },
  { key: 'projects', label: '📁 Hiệu suất từng dự án' },
  { key: 'timeline', label: '📈 Theo tuần / tháng' },
  { key: 'weekly', label: '📝 Báo cáo tuần' },
];

// Tổng quan (trong menu ☰): hiệu suất của mọi người qua tất cả dự án, từng dự án, theo tuần / tháng
export default function ProgressReport({
  project, isLeader, isGuest, initialTab = 'all',
}) {
  const [tab, setTab] = useState(initialTab);
  const { data, error, reload } = useOverview();
  const stats = tab !== 'weekly';
  return (
    <div>
      <div className="row between" style={{ marginBottom: 14 }}>
        <div className="view-switch" role="tablist">
          {TABS.filter((t) => project || t.key !== 'weekly').map((t) => (
            <button type="button" key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
        {stats && <button type="button" className="btn" onClick={reload}>Làm mới</button>}
      </div>
      {stats && data && data.leaderOf === 0 && (
        <p className="muted small">Bạn chưa là trưởng nhóm ở dự án nào nên chỉ thấy hiệu suất của chính mình.</p>
      )}
      {tab === 'weekly' && <ReportsTab project={project} isLeader={isLeader} isGuest={isGuest} />}
      {stats && error && <div className="alert">{error}</div>}
      {stats && !error && !data && <p className="muted">Đang tải...</p>}
      {data && tab === 'all' && <OverviewPeople people={data.people} />}
      {data && tab === 'projects' && <ProjectsPerformance data={data} />}
      {data && tab === 'timeline' && <TimelineCharts data={data} />}
    </div>
  );
}
