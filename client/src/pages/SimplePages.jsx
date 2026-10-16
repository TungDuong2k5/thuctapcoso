import ProgressReport from '../components/ProgressReport';
import AppearanceSettings from '../components/AppearanceSettings';

// Tổng quan hiệu suất qua tất cả dự án (mở từ thanh bên)
export function OverviewPage() {
  return (
    <div>
      <div className="page-head"><h2>📊 Tổng quan</h2></div>
      <ProgressReport project={null} />
    </div>
  );
}

// Chỉnh sửa giao diện: sáng / tối, ảnh nền (mở từ thanh bên)
export function AppearancePage() {
  return (
    <div>
      <div className="page-head"><h2>🎨 Giao diện</h2></div>
      <AppearanceSettings />
    </div>
  );
}
