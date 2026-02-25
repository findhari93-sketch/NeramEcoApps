'use client';

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import { useMicrosoftAuth } from '@neram/auth';
import type { AuthUser } from '@neram/auth';

interface AdminProfile {
  supabaseUserId: string | null;
  supabaseName: string;
  msUser: AuthUser | null;
  loading: boolean;
  error: string | null;
}

const AdminProfileContext = createContext<AdminProfile>({
  supabaseUserId: null,
  supabaseName: 'Admin',
  msUser: null,
  loading: true,
  error: null,
});

export function AdminProfileProvider({ children }: { children: ReactNode }) {
  const { user: msUser, loading: msLoading } = useMicrosoftAuth();
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [supabaseName, setSupabaseName] = useState('Admin');
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolvedRef = useRef(false);

  useEffect(() => {
    if (msLoading || !msUser || resolvedRef.current) return;
    resolvedRef.current = true;

    const resolve = async () => {
      setResolving(true);
      try {
        const msOid = msUser.id; // account.localAccountId from MSAL
        const email = msUser.email;
        const params = new URLSearchParams();
        if (msOid) params.set('msOid', msOid);
        if (email) params.set('email', email);

        const res = await fetch(`/api/auth/me?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setSupabaseUserId(data.user.id);
          setSupabaseName(data.user.name || msUser.name || 'Admin');
        } else {
          const errData = await res.json().catch(() => ({}));
          console.error('Failed to resolve admin profile:', errData);
          setError(errData.error || 'Failed to resolve admin profile');
        }
      } catch (err: any) {
        console.error('Admin profile resolution error:', err);
        setError(err.message || 'Network error resolving admin profile');
      } finally {
        setResolving(false);
      }
    };

    resolve();
  }, [msUser, msLoading]);

  const value: AdminProfile = {
    supabaseUserId,
    supabaseName,
    msUser,
    loading: msLoading || resolving,
    error,
  };

  return (
    <AdminProfileContext.Provider value={value}>
      {children}
    </AdminProfileContext.Provider>
  );
}

export function useAdminProfile(): AdminProfile {
  return useContext(AdminProfileContext);
}
