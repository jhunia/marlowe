import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, getToken, setToken } from './api';
import { setCurrency } from './format';
import type { Settings, User } from './types';

interface AuthState {
  user: User | null;
  settings: Settings | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshSettings: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  const applySettings = (s: Settings) => {
    setCurrency(s.currency);
    setSettings(s);
  };

  const refreshSettings = useCallback(async () => {
    applySettings(await api.get<Settings>('/settings'));
  }, []);

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    api
      .get<{ user: User; settings: Settings }>('/auth/me')
      .then((r) => {
        setUser(r.user);
        applySettings(r.settings);
      })
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    qc.clear();
  }, [qc]);

  useEffect(() => {
    const onLogout = () => {
      setUser(null);
      qc.clear();
    };
    window.addEventListener('keyhouse:logout', onLogout);
    return () => window.removeEventListener('keyhouse:logout', onLogout);
  }, [qc]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.post<{ token: string; user: User; settings: Settings }>('/auth/login', { email, password });
    setToken(r.token);
    setUser(r.user);
    applySettings(r.settings);
  }, []);

  return (
    <AuthContext.Provider value={{ user, settings, ready, login, logout, refreshSettings }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
