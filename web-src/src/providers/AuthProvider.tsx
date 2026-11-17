import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiError, onSessionExpired } from '../lib/api';
import { accountPage, site } from '../lib/site';
import { disconnectExecutor, restoreExecutor } from '../lib/execution';
import { User } from '../types/sdk';

type Auth = { token: string | null; user: User | null; loading: boolean; error: string; restore: () => Promise<void>; logout: () => Promise<void> };
const Context = createContext<Auth | null>(null);

export function AuthProvider({ children }: React.PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const restore = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!site().nonce) {
        setUser(null);
        return;
      }
      const current = await api<{ user: User }>('auth/me', site().nonce);
      setUser(current.user);
    } catch (cause) {
      if (cause instanceof ApiError && [401, 403].includes(cause.status)) setUser(null);
      else setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar a sessão.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void restore(); }, [restore]);
  useEffect(() => { void restoreExecutor(user?.id ?? null); }, [user?.id]);
  useEffect(() => onSessionExpired(() => {
    disconnectExecutor();
    setUser(null);
  }), []);
  const logout = async () => {
    if (!user) return;
    // Focus cleanup is best effort. The WordPress logout must remain available.
    void api('auth/logout', site().nonce, {}, undefined, undefined, true).catch(() => {});
    disconnectExecutor();
    accountPage(site().logoutUrl);
  };
  return <Context.Provider value={{ token: user ? site().nonce : null, user, loading, error, restore, logout }}>{children}</Context.Provider>;
}

export function useAuth() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('AuthProvider ausente');
  return ctx;
}
