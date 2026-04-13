'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { getSupabaseBrowserClient } from '@neram/database';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Session = { access_token: string; user: { id: string } | null } & Record<string, any>;
import { useRouter } from 'next/navigation';

interface CollegeInfo {
  id: string;
  name: string;
  slug: string;
  neram_tier: string;
}

interface CollegeAdminInfo {
  id: string;
  college_id: string;
  name: string;
  role: string;
}

interface CollegeDashboardContextValue {
  session: Session | null;
  collegeAdmin: CollegeAdminInfo | null;
  college: CollegeInfo | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshCollege: () => Promise<void>;
}

const CollegeDashboardContext = createContext<CollegeDashboardContextValue | null>(null);

export function CollegeDashboardProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [collegeAdmin, setCollegeAdmin] = useState<CollegeAdminInfo | null>(null);
  const [college, setCollege] = useState<CollegeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const loadAdminData = useCallback(async (token: string) => {
    try {
      const res = await fetch('/api/college-dashboard/profile', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      setCollegeAdmin(json.admin);
      setCollege(json.college);
    } catch {
      // Silently fail — session may be valid but profile fetch failed
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.access_token) {
        loadAdminData(s.access_token);
      } else {
        setCollegeAdmin(null);
        setCollege(null);
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
    router.push('/college-dashboard/login');
  };

  const refreshCollege = async () => {
    if (session?.access_token) {
      await loadAdminData(session.access_token);
    }
  };

  return (
    <CollegeDashboardContext.Provider value={{ session, collegeAdmin, college, loading, signOut, refreshCollege }}>
      {children}
    </CollegeDashboardContext.Provider>
  );
}

export function useCollegeDashboard() {
  const ctx = useContext(CollegeDashboardContext);
  if (!ctx) throw new Error('useCollegeDashboard must be used inside CollegeDashboardProvider');
  return ctx;
}
