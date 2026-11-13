import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import Avatar from './Avatar';
import { canInstall, onInstallChange, promptInstall } from '../pwa';

// Biểu tượng nét mảnh (SVG) cho thanh bên
const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  crown: 'M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z',
  users: 'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.5 3.5 0 0 1 0 6.7',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  palette: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.1-4-7.8-9-7.8M7.5 12a1 1 0 1 0 0-2M10.5 8a1 1 0 1 0 0-2M14.5 8a1 1 0 1 0 0-2',
  user: 'M20 21v-1.5A4.5 4.5 0 0 0 15.5 15h-7A4.5 4.5 0 0 0 4 19.5V21M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  panel: 'M4 4h16v16H4zM9 4v16',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4',
  plus: 'M12 5v14M5 12h14',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1',
  board: 'M4 4h16v16H4zM9.5 4v16M14.5 4v16',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  wrench: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  dots: 'M12 6.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2M12 19.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
};
export function Icon({ name, size = 19 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

const SECTIONS = [
  {
    title: 'Công việc',
    items: [
      { to: '/', icon: 'home', label: 'Trang chủ' },
      { to: '/projects?nhom=mine', icon: 'crown', label: 'Dự án của tôi' },
      { to: '/projects?nhom=joined', icon: 'users', label: 'Dự án đã tham gia' },
      { to: '/overview', icon: 'chart', label: 'Tổng quan' },
    ],
  },
  {
    title: 'Tiện ích',
    items: [
      { to: '/appearance', icon: 'palette', label: 'Giao diện' },
      { to: '/profile', icon: 'user', label: 'Thông tin cá nhân' },
    ],
  },
];

// Mục đang chọn: so cả đường dẫn và ?nhom (Dự án của tôi / đã tham gia); trong một dự án thì sáng mục theo vai trò
function isActive(item, location, projectRole) {
  const [path, query] = item.to.split('?');
  if (location.pathname.startsWith('/projects/')) {
    if (item.to === '/projects?nhom=mine') return projectRole === 'leader';
    if (item.to === '/projects?nhom=joined') return projectRole && projectRole !== 'leader';
    return false;
  }
  if (path !== location.pathname) return false;
  if (!query) return true;
  const want = new URLSearchParams(query).get('nhom');
  return (new URLSearchParams(location.search).get('nhom') || 'mine') === want;
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const inProject = /^\/projects\/\d+/.test(location.pathname);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('taskflow-sidebar') === 'collapsed'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [projectRole, setProjectRole] = useState(null);

  // Trang dự án báo vai trò của mình để thanh bên sáng đúng mục
  useEffect(() => {
    const onRole = (e) => setProjectRole(e.detail);
    window.addEventListener('taskflow:project-role', onRole);
    return () => window.removeEventListener('taskflow:project-role', onRole);
  }, []);
  useEffect(() => { if (!inProject) setProjectRole(null); }, [inProject]);
  useEffect(() => { setMobileOpen(false); }, [location.pathname, location.search]);

  const toggle = () => {
    if (window.matchMedia('(max-width: 900px)').matches) {
      setMobileOpen(!mobileOpen);
      return;
    }
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem('taskflow-sidebar', next ? 'collapsed' : 'open'); } catch { /* bỏ qua */ }
  };

  const signOut = () => {
    if (!window.confirm('Đăng xuất khỏi TaskFlow?')) return;
    logout();
    navigate('/login');
  };

  const sections = user.systemRole === 'admin'
    ? [...SECTIONS, { title: 'Quản trị', items: [{ to: '/admin', icon: 'shield', label: 'Người dùng' }] }]
    : SECTIONS;

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      <aside className="sidebar" aria-label="Điều hướng">
        <Link to="/" className="side-brand" title="TaskFlow">
          <img src="/favicon.png" alt="" className="side-logo" />
          <span className="side-label">TaskFlow</span>
        </Link>
        <nav className="side-nav">
          {sections.map((s) => (
            <div key={s.title} className="side-section">
              <div className="side-title side-label">{s.title}</div>
              {s.items.map((it) => (
                <Link key={it.to} to={it.to} title={it.label} className={`side-item ${isActive(it, location, projectRole) ? 'active' : ''}`}>
                  <Icon name={it.icon} />
                  <span className="side-label">{it.label}</span>
                </Link>
              ))}
            </div>
          ))}
          <InstallButton />
        </nav>
        <UserCard user={user} onProfile={() => navigate('/profile')} onSignOut={signOut} />
      </aside>
      {mobileOpen && <div className="side-backdrop" onClick={() => setMobileOpen(false)} />}

      <div className="shell-main">
        <header className="topbar app-header">
          <button type="button" className="icon-btn" onClick={toggle} title={collapsed ? 'Mở thanh bên' : 'Thu gọn thanh bên'} aria-label="Thu gọn / mở thanh bên">
            <Icon name="panel" size={20} />
          </button>
          <div className="topbar-right">
            <NotificationBell />
            <Link to="/profile" className="user-pill" title="Thông tin cá nhân">
              {user.studentCode ? `${user.studentCode} - ` : ''}{user.fullName}
            </Link>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

// Thẻ tài khoản ở cuối thanh bên, bấm ⋮ để mở Thông tin cá nhân / Đăng xuất
function UserCard({ user, onProfile, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="side-user" ref={ref}>
      <Avatar name={user.fullName} src={user.avatarUrl} size={38} />
      <div className="side-user-text side-label">
        <strong>{user.fullName}</strong>
        <small>{user.email}</small>
      </div>
      <button type="button" className="icon-btn side-label" onClick={() => setOpen(!open)} aria-label="Tùy chọn tài khoản">
        <Icon name="dots" />
      </button>
      {open && (
        <div className="side-user-menu">
          <button type="button" onClick={() => { setOpen(false); onProfile(); }}><Icon name="user" size={16} /> Thông tin cá nhân</button>
          <button type="button" className="danger-text" onClick={() => { setOpen(false); onSignOut(); }}><Icon name="logout" size={16} /> Đăng xuất</button>
        </div>
      )}
    </div>
  );
}

// Nút "Cài ứng dụng" (PWA): chỉ hiện khi trình duyệt cho phép cài và app chưa được cài
function InstallButton() {
  const [show, setShow] = useState(canInstall());
  useEffect(() => onInstallChange(() => setShow(canInstall())), []);
  if (!show) return null;
  return (
    <button type="button" className="side-item install-app" title="Cài TaskFlow như một ứng dụng" onClick={promptInstall}>
      <Icon name="download" />
      <span className="side-label">Cài ứng dụng</span>
    </button>
  );
}
