'use client';

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import { useMicrosoftAuth, getAccessTokenSilent, loginScopes } from '@neram/auth';
import type { AuthUser } from '@neram/auth';
import { installAdminApiAuth } from '@/lib/api-auth-fetch';
import { requestReauth } from '@/lib/admin-reauth';
import SessionExpiredDialog from '@/components/SessionExpiredDialog';

const silentToken = () => getAccessTokenSilent(loginScopes.default);

// Every /api/ call from the dashboard carries the staff member's token, which
// middleware.ts verifies. Installed at module load so it is in place before any
// child component's effect fetches. When the token cannot be renewed silently,
// the call waits on the Sign in again dialog (a popup, never a redirect, so a
// half-filled form survives) and then goes out with the new token.
installAdminApiAuth(silentToken, () => requestReauth());

/** How often returning to the tab re-checks that a token can still be had. */
const RECHECK_MS = 2 * 60 * 1000;

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
        // Send the Microsoft access token and let the server verify who this is.
        // Previously the identity was passed as msOid/email query parameters,
        // which the server then trusted; see the note in /api/auth/me.
        const token = (await silentToken()) ?? (await requestReauth());
        if (!token) {
          setError('Could not get a Microsoft token. Please sign in again.');
          return;
        }

        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
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

  // A tab left open overnight still shows the staff member's name, but the
  // token behind it has expired. Check when they come back to the tab, so the
  // Sign in again prompt appears before they start filling a form, not on Save.
  useEffect(() => {
    if (msLoading || !msUser) return;
    let lastCheck = Date.now();
    const recheck = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastCheck < RECHECK_MS) return;
      lastCheck = Date.now();
      if (!(await silentToken())) void requestReauth();
    };
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    return () => {
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
    };
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
      <SessionExpiredDialog />
    </AdminProfileContext.Provider>
  );
}

export function useAdminProfile(): AdminProfile {
  return useContext(AdminProfileContext);
}
