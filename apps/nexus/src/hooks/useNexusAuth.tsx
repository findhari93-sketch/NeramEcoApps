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
  ms_team_id: string | null;
  ms_team_name: string | null;
  ms_team_sync_enabled: boolean;
  enrollmentRole: 'teacher' | 'student';
}

type NexusRole = 'admin' | 'teacher' | 'student' | 'parent';

type OnboardingStatus = 'in_progress' | 'submitted' | 'approved' | 'rejected' | null;

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

  // Onboarding
  onboardingStatus: OnboardingStatus;
  isOnboardingComplete: boolean;
  isProfileComplete: boolean;
  refreshOnboardingStatus: () => void;

  // Combined loading
  loading: boolean;
  error: string | null;

  // Helpers
  isTeacher: boolean;
  isStudent: boolean;
  isAdmin: boolean;
  getToken: () => Promise<string | null>;
  /** Get token with extended teacher scopes (meetings, channels, calendar) */
  getTeacherToken: () => Promise<string | null>;
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
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus>(null);
  const [profileComplete, setProfileComplete] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dbLoading, setDbLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getToken = useCallback(async () => {
    return getAccessToken(loginScopes.nexus);
  }, []);

  const getTeacherToken = useCallback(async () => {
    return getAccessToken(loginScopes.nexusTeacher);
  }, []);

  // E2E test auth bypass: if nexus_test_token exists in localStorage,
  // read cached auth data directly from localStorage (no API call needed).
  // The auth setup stores nexus_auth_user, nexus_auth_role, nexus_auth_classrooms.
  const [testMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem('nexus_test_token');
  });

  useEffect(() => {
    if (!testMode) return;

    try {
      const userJson = localStorage.getItem('nexus_auth_user');
      const roleStr = localStorage.getItem('nexus_auth_role');
      const classroomsJson = localStorage.getItem('nexus_auth_classrooms');

      if (userJson && roleStr) {
        const parsedUser = JSON.parse(userJson) as NexusUser;
        const parsedClassrooms = classroomsJson ? JSON.parse(classroomsJson) as NexusClassroom[] : [];

        setUser(parsedUser);
        setNexusRole(roleStr as NexusRole);
        setClassrooms(parsedClassrooms);

        // Restore onboarding/profile status from localStorage (set during test-login injection)
        const storedOnboardingStatus = localStorage.getItem('nexus_auth_onboarding_status');
        if (storedOnboardingStatus) {
          setOnboardingStatus(storedOnboardingStatus as OnboardingStatus);
        }
        const storedProfileComplete = localStorage.getItem('nexus_auth_profile_complete');
        if (storedProfileComplete !== null) {
          setProfileComplete(storedProfileComplete === 'true');
        }

        const savedClassroomId = localStorage.getItem(ACTIVE_CLASSROOM_KEY);
        const savedClassroom = parsedClassrooms.find(c => c.id === savedClassroomId);
        setActiveClassroomState(savedClassroom || parsedClassrooms[0] || null);
      }
    } catch (err) {
      console.error('Nexus test auth: failed to parse localStorage:', err);
    } finally {
      setDbLoading(false);
    }
  }, [testMode]);

  // Fetch DB user after MS auth succeeds (skip if test token is present)
  useEffect(() => {
    // Skip MSAL auth fetch if test token bypass is active
    if (testMode) return;

    if (!msUser || msLoading) {
      setUser(null);
      setNexusRole(null);
      setClassrooms([]);
      setActiveClassroomState(null);
      // Only clear dbLoading if MS auth is definitively done (not loading)
      // so we don't briefly show loading=false with user=null
      if (!msLoading) setDbLoading(false);
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
        setOnboardingStatus(data.onboardingStatus || null);
        setProfileComplete(data.profileComplete ?? true);

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
  }, [msUser, msLoading, refreshKey]);

  const setActiveClassroom = useCallback((classroom: NexusClassroom) => {
    setActiveClassroomState(classroom);
    localStorage.setItem(ACTIVE_CLASSROOM_KEY, classroom.id);
  }, []);

  const refreshOnboardingStatus = useCallback(() => {
    setRefreshKey((k) => k + 1);
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
    loading: testMode ? dbLoading : msLoading || dbLoading,
    error,
    onboardingStatus,
    isOnboardingComplete: onboardingStatus === 'approved' || nexusRole !== 'student',
    isProfileComplete: profileComplete,
    refreshOnboardingStatus,
    isTeacher: nexusRole === 'teacher' || nexusRole === 'admin',
    isStudent: nexusRole === 'student',
    isAdmin: nexusRole === 'admin',
    getToken,
    getTeacherToken,
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
