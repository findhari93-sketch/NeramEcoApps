'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { getSupabaseBrowserClient } from '@neram/database';
type Session = { access_token: string; user: { id: string } | null } & Record<string, any>;
import { useRouter } from 'next/navigation';
import type { CollegeRole } from '@/lib/college-dashboard/permissions';

export interface CollegeInfo {
  id: string;
  name: string;
  slug: string;
  state_slug: string | null;
  city: string | null;
  neram_tier: string;
  verified: boolean;
  logo_url: string | null;
}

interface CollegeAdminInfo {
  id: string;
  college_id: string;
  name: string;
  email: string;
  role: CollegeRole;
}

export interface PlanRow {
  tier: string;
  starts_on: string;
  ends_on: string;
  status: string;
  revoked_at?: string | null;
}

export interface PlanInfo {
  tier: string;
  active: PlanRow | null;
  upcoming: PlanRow | null;
  last_ended: PlanRow | null;
}

interface CollegeDashboardContextValue {
  session: Session | null;
  collegeAdmin: CollegeAdminInfo | null;
  college: CollegeInfo | null;
  plan: PlanInfo | null;
  pendingSubmissions: number;
  /** Set when the session is valid but the account cannot use the dashboard. */
  accessError: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshCollege: () => Promise<void>;
  /** fetch with the session token; JSON body in, parsed JSON (or an error message) out. */
  api: <T = any>(path: string, init?: { method?: string; body?: unknown; form?: FormData }) => Promise<{ ok: boolean; status: number; data: T & { error?: string; fields?: Record<string, string> } }>;
}

const CollegeDashboardContext = createContext<CollegeDashboardContextValue | null>(null);

export function CollegeDashboardProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [collegeAdmin, setCollegeAdmin] = useState<CollegeAdminInfo | null>(null);
  const [college, setCollege] = useState<CollegeInfo | null>(null);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [pendingSubmissions, setPending] = useState(0);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const loadAdminData = useCallback(async (token: string) => {
    try {
      const res = await fetch('/api/college-dashboard/profile', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAccessError(res.status === 403 ? json.error ?? 'This account cannot open the dashboard.' : null);
        return;
      }
      setAccessError(null);
      setCollegeAdmin(json.admin);
      setCollege(json.college);
      setPlan(json.plan);
      setPending(json.pending_submissions ?? 0);
    } catch {
      // Silently fail: session may be valid but profile fetch failed
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.access_token) {
        loadAdminData(s.access_token).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (s?.access_token) {
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') loadAdminData(s.access_token);
      } else {
        setCollegeAdmin(null);
        setCollege(null);
        setPlan(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadAdminData]);

  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    setSession(null);
    setCollegeAdmin(null);
    setCollege(null);
    setPlan(null);
    setAccessError(null);
    router.push('/college-dashboard/login');
  };

  const refreshCollege = useCallback(async () => {
    if (session?.access_token) {
      await loadAdminData(session.access_token);
    }
  }, [session?.access_token, loadAdminData]);

  const api = useCallback(
    async (path: string, init: { method?: string; body?: unknown; form?: FormData } = {}) => {
      const headers: Record<string, string> = {};
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      if (init.body !== undefined) headers['Content-Type'] = 'application/json';
      try {
        const res = await fetch(path, {
          method: init.method ?? (init.body !== undefined || init.form ? 'POST' : 'GET'),
          headers,
          body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
        });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
      } catch {
        return { ok: false, status: 0, data: { error: 'No connection. Check your internet and try again.' } as any };
      }
    },
    [session?.access_token]
  );

  return (
    <CollegeDashboardContext.Provider
      value={{ session, collegeAdmin, college, plan, pendingSubmissions, accessError, loading, signOut, refreshCollege, api }}
    >
      {children}
    </CollegeDashboardContext.Provider>
  );
}

export function useCollegeDashboard() {
  const ctx = useContext(CollegeDashboardContext);
  if (!ctx) throw new Error('useCollegeDashboard must be used inside CollegeDashboardProvider');
  return ctx;
}
