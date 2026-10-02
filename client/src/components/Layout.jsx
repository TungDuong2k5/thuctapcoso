import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import Avatar from './Avatar';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">TaskFlow</Link>
        <nav>
          <NavLink to="/" end>Dự án</NavLink>
          {user.systemRole === 'admin' && <NavLink to="/admin">Quản trị</NavLink>}
        </nav>
        <div className="topbar-right">
          <NotificationBell />
          <Link to="/profile" className="user-chip" title="Hồ sơ cá nhân">
            <Avatar name={user.fullName} size={30} />
            <span>{user.fullName}</span>
          </Link>
          <button type="button" className="btn ghost" onClick={() => { logout(); navigate('/login'); }}>Đăng xuất</button>
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
