import { createContext, useContext, useEffect, useState } from 'react';
import api, { closeSocket } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      setLoading(false);
      return;
    }
    api.get('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  const saveSession = ({ token, user: u }) => {
    closeSocket();
    localStorage.setItem('token', token);
    setUser(u);
  };

  const login = async (email, password) => saveSession((await api.post('/auth/login', { email, password })).data);
  const register = async (data) => saveSession((await api.post('/auth/register', data)).data);
  const loginWithGoogle = async (credential) => saveSession((await api.post('/auth/google', { credential })).data);
  const logout = () => {
    closeSocket();
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user, setUser, loading, login, register, loginWithGoogle, logout,
    }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
