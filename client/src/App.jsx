import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectPage from './pages/ProjectPage';
import AdminUsers from './pages/AdminUsers';
import Profile from './pages/Profile';
import Invite from './pages/Invite';
import ResetPassword from './pages/ResetPassword';
import { AppearancePage, OverviewPage } from './pages/SimplePages';

function Private({ children, admin }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center muted">Đang tải...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.systemRole !== 'admin') return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/invite/:token" element={<Invite />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/" element={<Private><Dashboard /></Private>} />
      <Route path="/projects" element={<Private><Projects /></Private>} />
      <Route path="/projects/:id/*" element={<Private><ProjectPage /></Private>} />
      <Route path="/overview" element={<Private><OverviewPage /></Private>} />
      <Route path="/appearance" element={<Private><AppearancePage /></Private>} />
      <Route path="/profile" element={<Private><Profile /></Private>} />
      <Route path="/admin" element={<Private admin><AdminUsers /></Private>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
