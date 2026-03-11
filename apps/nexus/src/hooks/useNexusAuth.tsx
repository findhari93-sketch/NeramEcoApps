'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { useMicrosoftAuth, getAccessToken, loginScopes } from '@neram/auth';

// Types for Nexus auth context
interface NexusUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  user_type: string;
}

interface NexusClassroom {
  id: string;
  name: string;
  type: string;
  description: string | null;
  is_active: boolean;
  enrollmentRole: 'teacher' | 'student';
}

type NexusRole = 'admin' | 'teacher' | 'student' | 'parent';

interface NexusAuthState {
  // MS auth state
  msUser: ReturnType<typeof useMicrosoftAuth>['user'];
  msLoading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;

  // DB user state
  user: NexusUser | null;
  nexusRole: NexusRole | null;
  classrooms: NexusClassroom[];
  activeClassroom: NexusClassroom | null;
  setActiveClassroom: (classroom: NexusClassroom) => void;

  // Combined loading
  loading: boolean;
  error: string | null;

  // Helpers
  isTeacher: boolean;
  isStudent: boolean;
  isAdmin: boolean;
  getToken: () => Promise<string | null>;
}

const ACTIVE_CLASSROOM_KEY = 'nexus_active_classroom_id';

export function useNexusAuth(): NexusAuthState {
  const {
    user: msUser,
    loading: msLoading,
    signIn: msSignIn,
    signOut: msSignOut,
  } = useMicrosoftAuth();

  const [user, setUser] = useState<NexusUser | null>(null);
  const [nexusRole, setNexusRole] = useState<NexusRole | null>(null);
  const [classrooms, setClassrooms] = useState<NexusClassroom[]>([]);
  const [activeClassroom, setActiveClassroomState] = useState<NexusClassroom | null>(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getToken = useCallback(async () => {
    return getAccessToken(loginScopes.nexus);
  }, []);

  // Fetch DB user after MS auth succeeds
  useEffect(() => {
    if (!msUser || msLoading) {
      setUser(null);
      setNexusRole(null);
      setClassrooms([]);
      setActiveClassroomState(null);
      return;
    }

    let cancelled = false;

    async function fetchNexusUser() {
      setDbLoading(true);
      setError(null);

      try {
        const token = await getAccessToken(loginScopes.default);
        if (!token || cancelled) return;

        const response = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `Auth failed: ${response.status}`);
        }

        const data = await response.json();
        if (cancelled) return;

        setUser(data.user);
        setNexusRole(data.nexusRole);
        setClassrooms(data.classrooms || []);

        // Restore active classroom from localStorage or use first one
        const savedClassroomId = localStorage.getItem(ACTIVE_CLASSROOM_KEY);
        const savedClassroom = (data.classrooms || []).find(
          (c: NexusClassroom) => c.id === savedClassroomId
        );
        setActiveClassroomState(savedClassroom || data.classrooms?.[0] || null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load user data');
          console.error('Nexus auth error:', err);
        }
      } finally {
        if (!cancelled) {
          setDbLoading(false);
        }
      }
    }

    fetchNexusUser();
    return () => { cancelled = true; };
  }, [msUser, msLoading]);

  const setActiveClassroom = useCallback((classroom: NexusClassroom) => {
    setActiveClassroomState(classroom);
    localStorage.setItem(ACTIVE_CLASSROOM_KEY, classroom.id);
  }, []);

  const signIn = useCallback(async () => {
    await msSignIn();
  }, [msSignIn]);

  const signOut = useCallback(async () => {
    setUser(null);
    setNexusRole(null);
    setClassrooms([]);
    setActiveClassroomState(null);
    localStorage.removeItem(ACTIVE_CLASSROOM_KEY);
    await msSignOut();
  }, [msSignOut]);

  return {
    msUser,
    msLoading,
    signIn,
    signOut,
    user,
    nexusRole,
    classrooms,
    activeClassroom,
    setActiveClassroom,
    loading: msLoading || dbLoading,
    error,
    isTeacher: nexusRole === 'teacher' || nexusRole === 'admin',
    isStudent: nexusRole === 'student',
    isAdmin: nexusRole === 'admin',
    getToken,
  };
}

// Context for sharing auth state across components
const NexusAuthContext = createContext<NexusAuthState | null>(null);

export function NexusAuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useNexusAuth();
  return (
    <NexusAuthContext.Provider value={auth}>
      {children}
    </NexusAuthContext.Provider>
  );
}

export function useNexusAuthContext(): NexusAuthState {
  const context = useContext(NexusAuthContext);
  if (!context) {
    throw new Error('useNexusAuthContext must be used within NexusAuthProvider');
  }
  return context;
}
