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

// "View as Student" (impersonation) shapes
export interface ImpersonationStudent {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  ms_oid: string;
}

interface StoredImpersonation {
  token: string;
  expiresAt: string;
  impersonatorName: string | null;
  student: ImpersonationStudent;
}

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
  /**
   * Set when the signed-in user has been graduated to alumni and is locked out
   * of Nexus (the /api/auth/me gate returns 403 with error: 'alumni'). The UI
   * renders a friendly "you've graduated" screen instead of the app.
   */
  accessEnded: { reason: string; message: string } | null;

  // Helpers
  isTeacher: boolean;
  isStudent: boolean;
  isAdmin: boolean;
  getToken: () => Promise<string | null>;
  /** Get token with extended teacher scopes (meetings, channels, calendar) */
  getTeacherToken: () => Promise<string | null>;

  // "View as Student" (impersonation)
  /** Active impersonation, if a teacher/admin is currently viewing as a student. */
  impersonation: {
    active: boolean;
    student: ImpersonationStudent | null;
    impersonatorName: string | null;
    expiresAt: string | null;
  };
  /** Start viewing as the given student (teacher/admin only). Throws on failure. */
  startImpersonation: (
    studentId: string,
    opts?: { reason?: string; ticketId?: string }
  ) => Promise<void>;
  /** Exit student view and return to the teacher/admin's own session. */
  exitImpersonation: () => Promise<void>;
}

const ACTIVE_CLASSROOM_KEY = 'nexus_active_classroom_id';
const IMPERSONATION_KEY = 'nexus_impersonation';

function readStoredImpersonation(): StoredImpersonation | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(IMPERSONATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredImpersonation;
    if (!parsed?.token || !parsed?.expiresAt || !parsed?.student) return null;
    if (Date.parse(parsed.expiresAt) <= Date.now()) {
      sessionStorage.removeItem(IMPERSONATION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

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
  const [accessEnded, setAccessEnded] = useState<{ reason: string; message: string } | null>(null);

  // "View as Student" (impersonation) state, persisted in sessionStorage so it
  // survives reloads within the tab but auto-clears when the tab closes.
  const [impersonationState, setImpersonationState] = useState<StoredImpersonation | null>(
    () => readStoredImpersonation()
  );

  // Active only while not expired. This is the token used for ALL API calls
  // while impersonating, so every request resolves to the target student.
  const impersonationToken =
    impersonationState && Date.parse(impersonationState.expiresAt) > Date.now()
      ? impersonationState.token
      : null;

  const clearImpersonation = useCallback(() => {
    try {
      sessionStorage.removeItem(IMPERSONATION_KEY);
    } catch {
      /* ignore */
    }
    setImpersonationState(null);
  }, []);

  const getToken = useCallback(async () => {
    // While impersonating, hand out the impersonation token so the entire app
    // (reads and writes) acts as the student.
    if (impersonationToken) return impersonationToken;
    return getAccessToken(loginScopes.nexus);
  }, [impersonationToken]);

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
    // While impersonating, the /api/auth/me effect drives identity from the
    // impersonation token instead of the cached test-mode user.
    if (!testMode || impersonationToken) return;

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
  }, [testMode, impersonationToken]);

  // Fetch DB user after MS auth succeeds. Also runs while impersonating (even
  // under the test-mode bypass) so identity swaps to the student via /me.
  useEffect(() => {
    // Skip MSAL auth fetch if test token bypass is active and not impersonating
    if (testMode && !impersonationToken) return;

    if (!impersonationToken && (!msUser || msLoading)) {
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
      setAccessEnded(null);

      try {
        // While impersonating, /api/auth/me is called with the impersonation
        // token so it returns the STUDENT's identity, role, and classrooms.
        const token = impersonationToken || (await getAccessToken(loginScopes.default));
        if (!token || cancelled) return;

        const response = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          // An expired/invalid impersonation token: drop it and let this effect
          // re-run with the real teacher/admin token (graceful auto-exit).
          if (impersonationToken && !cancelled) {
            clearImpersonation();
            return;
          }
          const data = await response.json().catch(() => ({}));
          // Alumni lockout: the student has graduated. Surface a dedicated state
          // so the UI shows a warm "you've graduated" screen instead of an error.
          if (response.status === 403 && data?.error === 'alumni') {
            if (!cancelled) {
              setAccessEnded({
                reason: 'alumni',
                message:
                  data.message ||
                  "You've completed the program and are now a Neram alumnus. Your Nexus access has ended.",
              });
              setUser(null);
              setNexusRole(null);
              setClassrooms([]);
              setActiveClassroomState(null);
            }
            return;
          }
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
  }, [msUser, msLoading, refreshKey, impersonationToken, clearImpersonation, testMode]);

  // Auto-exit impersonation when the token expires, returning to teacher view.
  useEffect(() => {
    if (!impersonationToken || !impersonationState) return;
    const ms = Date.parse(impersonationState.expiresAt) - Date.now();
    if (ms <= 0) {
      clearImpersonation();
      return;
    }
    const t = setTimeout(() => clearImpersonation(), ms);
    return () => clearTimeout(t);
  }, [impersonationToken, impersonationState, clearImpersonation]);

  const startImpersonation = useCallback(
    async (studentId: string, opts?: { reason?: string; ticketId?: string }) => {
      // Mint with the real teacher/admin token. Under the E2E test-mode bypass
      // there is no MSAL token, so fall back to the injected test token (which
      // verifyMsToken accepts in non-production).
      const testToken =
        typeof window !== 'undefined' ? localStorage.getItem('nexus_test_token') : null;
      const token = testToken || (await getAccessToken(loginScopes.nexus));
      const res = await fetch('/api/auth/impersonate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          studentId,
          reason: opts?.reason,
          ticketId: opts?.ticketId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to start student view');
      }

      const data = await res.json();
      const stored: StoredImpersonation = {
        token: data.token,
        expiresAt: data.expiresAt,
        impersonatorName: data.impersonatorName ?? null,
        student: data.student,
      };
      try {
        sessionStorage.setItem(IMPERSONATION_KEY, JSON.stringify(stored));
      } catch {
        /* ignore */
      }
      // Setting state re-runs the /api/auth/me effect with the impersonation
      // token, swapping the whole context to the student.
      setImpersonationState(stored);
    },
    []
  );

  const exitImpersonation = useCallback(async () => {
    // Best-effort: close the audit session with the impersonation token still
    // in hand, before clearing local state.
    try {
      const raw = sessionStorage.getItem(IMPERSONATION_KEY);
      const parsed = raw ? (JSON.parse(raw) as StoredImpersonation) : null;
      if (parsed?.token) {
        await fetch('/api/auth/impersonate/end', {
          method: 'POST',
          headers: { Authorization: `Bearer ${parsed.token}` },
        }).catch(() => undefined);
      }
    } catch {
      /* ignore */
    }
    clearImpersonation();
  }, [clearImpersonation]);

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
    setAccessEnded(null);
    localStorage.removeItem(ACTIVE_CLASSROOM_KEY);
    clearImpersonation();
    await msSignOut();
  }, [msSignOut, clearImpersonation]);

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
    accessEnded,
    onboardingStatus,
    isOnboardingComplete: onboardingStatus === 'approved' || nexusRole !== 'student',
    isProfileComplete: profileComplete,
    refreshOnboardingStatus,
    isTeacher: nexusRole === 'teacher' || nexusRole === 'admin',
    isStudent: nexusRole === 'student',
    isAdmin: nexusRole === 'admin',
    getToken,
    getTeacherToken,
    impersonation: {
      active: !!impersonationToken,
      student: impersonationToken ? impersonationState!.student : null,
      impersonatorName: impersonationToken ? impersonationState!.impersonatorName : null,
      expiresAt: impersonationToken ? impersonationState!.expiresAt : null,
    },
    startImpersonation,
    exitImpersonation,
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
