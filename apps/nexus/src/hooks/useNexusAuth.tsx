'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { useMicrosoftAuth, getAccessToken, loginScopes } from '@neram/auth';
import {
  resolveFlags,
  allFeaturesEnabled,
  isFeatureEnabled as checkFeatureEnabled,
  type FlagMap,
} from '@/lib/feature-flags';
import {
  cloneDefaultWindow,
  parseWindow,
  type TimetableWindow,
} from '@/lib/timetable-window';
import { DEFAULT_PHOTO_GATE, type PhotoGateState } from '@/lib/photo-gate';
import {
  readParentSession,
  writeParentSession,
  clearParentSession,
  type StoredParentSession,
} from '@/lib/parent-session';
import {
  capabilityMap,
  isInternalStaff as isInternalStaffRole,
  type Capability,
  type CapabilityMap,
  type StaffRole,
} from '@/lib/staff-capabilities';

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
  /** Page the teacher/admin was on when they started this session, so Exit can return there. */
  returnUrl: string | null;
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

  /**
   * Resolved feature-flag map (every known feature id → boolean), driving which
   * menus/pages are available. Comes from /api/auth/me (admin overrides merged
   * with registry defaults). See @/lib/feature-flags.
   */
  featureFlags: FlagMap;
  /** Convenience: is a given feature id enabled for this user right now? */
  isFeatureEnabled: (id: string) => boolean;

  /**
   * Nexus authority tier, from /api/auth/me. Distinct from `nexusRole`, which is
   * only the coarse route-group role: a `manager` has nexusRole 'teacher'.
   * See @/lib/staff-capabilities.
   */
  staffRole: StaffRole | null;
  /** Whether this person may be assigned as the tutor of a class. */
  canTeach: boolean;
  /**
   * Does this user hold a capability? Use this for anything finer than
   * "staff vs student", in place of reading nexusRole. Fail-closed: an unknown
   * capability, or a payload from before the tier rollout, returns false.
   */
  can: (capability: Capability) => boolean;
  /** admin or manager: the internal core team, who see and act across ALL classes. */
  isInternalStaff: boolean;

  /**
   * The evening class window the timetable draws (admin-configured, from
   * /api/auth/me). Classes outside it still show: the grid expands to fit.
   * See @/lib/timetable-window.
   */
  timetableWindow: TimetableWindow;

  /**
   * Mandatory profile-photo state, from /api/auth/me. When `required` is true
   * the app renders the full-screen PhotoRequiredGate instead of any route.
   * Students only, never while impersonating. See @/lib/photo-gate.
   */
  photoGate: PhotoGateState;

  /**
   * Re-fetch /api/auth/me. Used by the photo blocker so a successful upload
   * lifts the block in one round trip instead of a full page reload.
   */
  refreshAuth: () => Promise<void>;

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
  /**
   * "Is this a staff member", NOT "does this person teach". True for admin,
   * manager and teacher alike, which is what the staff-vs-student UI branches
   * want. For anything finer, use `can(...)`; for tutor eligibility use
   * `canTeach`; for "sees every class" use `isInternalStaff`.
   */
  isTeacher: boolean;
  isStudent: boolean;
  /**
   * True only for the `admin` tier. A `manager` is deliberately false here, so
   * the admin-only panel and system settings stay hidden from them.
   */
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
    /** Page the teacher/admin was on when they started this session, so Exit can return there. */
    returnUrl: string | null;
  };
  /** Start viewing as the given student (teacher/admin only). Throws on failure. */
  startImpersonation: (
    studentId: string,
    opts?: { reason?: string; ticketId?: string; returnUrl?: string }
  ) => Promise<void>;
  /** Exit student view and return to the teacher/admin's own session. */
  exitImpersonation: () => Promise<void>;

  /**
   * Parent portal session state. `active` is the reliable "this is a parent"
   * signal on the client; nexusRole is set from /api/auth/me a moment later.
   */
  parentSession: {
    active: boolean;
    parent: { id: string; name: string | null } | null;
    /** True until they replace the admin-issued temporary password. */
    mustChangePassword: boolean;
    expiresAt: string | null;
  };
  /** Sign in with an admin-issued parent login ID and password. Throws on failure. */
  parentLogin: (loginId: string, password: string) => Promise<StoredParentSession>;

  /**
   * The children linked to the signed-in parent, and which one the UI is showing.
   *
   * /api/auth/me has always returned these; this context used to drop them on the
   * floor, so every parent page had to make its own request just to learn the
   * child's name. Empty for every non-parent role.
   *
   * An array from the start even though Phase 1 links exactly one child, matching
   * the shape listParentChildren already returns, so adding a sibling switcher
   * later is purely additive.
   */
  children: ParentChildRef[];
  activeChildId: string | null;
}

/** A child linked to the signed-in parent, as /api/auth/me reports them. */
export interface ParentChildRef {
  id: string;
  name: string | null;
  avatar_url: string | null;
  relationship: string;
  is_primary: boolean;
  classroom_id: string | null;
  classroom_name: string | null;
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
  const [dbLoading, setDbLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessEnded, setAccessEnded] = useState<{ reason: string; message: string } | null>(null);
  // Default to registry defaults (student features off, staff on) until /me loads.
  const [featureFlags, setFeatureFlags] = useState<FlagMap>(() => resolveFlags({}));
  const [timetableWindow, setTimetableWindow] = useState<TimetableWindow>(() => cloneDefaultWindow());
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null);
  const [canTeach, setCanTeach] = useState<boolean>(true);
  // Starts as the all-false map, so the UI hides staff actions until /me answers
  // rather than flashing them and then removing them.
  const [capabilities, setCapabilities] = useState<CapabilityMap>(() => capabilityMap(null));
  // Default never blocks: a gate that defaults to "blocked" would flash the
  // blocker on every page load for every compliant student.
  const [photoGate, setPhotoGate] = useState<PhotoGateState>(DEFAULT_PHOTO_GATE);
  // Parent portal: which children this login covers. Empty for every other role.
  const [children, setChildren] = useState<ParentChildRef[]>([]);
  const [activeChildId, setActiveChildId] = useState<string | null>(null);

  // "View as Student" (impersonation) state, persisted in sessionStorage so it
  // survives reloads within the tab but auto-clears when the tab closes.
  const [impersonationState, setImpersonationState] = useState<StoredImpersonation | null>(
    () => readStoredImpersonation()
  );

  // Parent portal session. Parents have no Microsoft account, so this is the
  // only identity they ever have. Mirrors the impersonation block above, except
  // it lives in localStorage: see lib/parent-session.ts for why.
  const [parentSession, setParentSession] = useState<StoredParentSession | null>(
    () => readParentSession()
  );

  const parentToken =
    parentSession && Date.parse(parentSession.expiresAt) > Date.now()
      ? parentSession.token
      : null;

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

    // A signed-in parent has no MSAL session at all, so this is their only
    // token. Ordered after impersonation (a staff member viewing as a student
    // is the more specific session) and before the test bypass, so an E2E run
    // that injects a parent session is not silently downgraded to a test token.
    if (parentToken) return parentToken;

    // E2E test-mode bypass: the harness injects a `test_`-prefixed token that
    // verifyMsToken accepts in non-production only. Without this fallback, a
    // page under the bypass renders its chrome but never fetches anything,
    // because MSAL has no session in the test browser, so tests can only ever
    // assert on layout and never on real data. Mirrors the same fallback in
    // startImpersonation below. Inert in production: no test token is ever set
    // there, and the server rejects one anyway.
    if (typeof window !== 'undefined') {
      const injected = localStorage.getItem('nexus_test_token');
      if (injected) return injected;
    }

    return getAccessToken(loginScopes.nexus);
  }, [impersonationToken, parentToken]);

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
        // E2E test mode has no /me call: keep every feature enabled so existing
        // student-facing specs are unaffected. Impersonation-based tests hit the
        // real /me path and get the DB-driven flags instead.
        setFeatureFlags(allFeaturesEnabled());

        // Same for capabilities: test mode has no /me, so take the tier the test
        // harness stored. A spec that injects only a role (the pre-tier shape)
        // maps 'teacher' onto `manager`, matching the test-login default, so
        // pre-existing teacher specs keep the broad powers they were written
        // against. See the note in /api/auth/test-login.
        const storedStaffRole = localStorage.getItem('nexus_auth_staff_role');
        const testStaffRole: StaffRole | null =
          storedStaffRole === 'admin' || storedStaffRole === 'manager' || storedStaffRole === 'teacher'
            ? storedStaffRole
            : roleStr === 'admin'
              ? 'admin'
              : roleStr === 'teacher'
                ? 'manager'
                : null;
        const testCanTeach = localStorage.getItem('nexus_auth_can_teach') !== 'false';
        setStaffRole(testStaffRole);
        setCanTeach(testCanTeach);
        setCapabilities(capabilityMap(testStaffRole, testCanTeach));

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

  /**
   * Load identity, role, classrooms, flags and the photo gate from
   * /api/auth/me. Extracted from the effect below so `refreshAuth` can re-run
   * exactly the same load without duplicating the impersonation and error
   * handling. `isCancelled` lets the effect abandon an in-flight load on
   * unmount; the manual refresh path passes a predicate that never cancels.
   */
  const loadNexusUser = useCallback(
    async (isCancelled: () => boolean) => {
      setDbLoading(true);
      setError(null);
      setAccessEnded(null);

      try {
        // While impersonating, /api/auth/me is called with the impersonation
        // token so it returns the STUDENT's identity, role, and classrooms.
        // A parent token does the same for the parent branch of that route.
        // Falling through to getAccessToken for a parent would ask MSAL for a
        // token it can never mint, and the whole context would stay empty.
        const token =
          impersonationToken || parentToken || (await getAccessToken(loginScopes.default));
        if (!token || isCancelled()) return;

        const response = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          // An expired/invalid impersonation token: drop it and let this effect
          // re-run with the real teacher/admin token (graceful auto-exit).
          if (impersonationToken && !isCancelled()) {
            clearImpersonation();
            return;
          }
          const data = await response.json().catch(() => ({}));
          // Full-screen lockout: the /api/auth/me gate returns 403 with
          // error: 'alumni' when the student has graduated. It surfaces a
          // dedicated state so the UI shows a friendly "you've graduated"
          // screen instead of an error. (Students who simply aren't enrolled
          // in a classroom get a 200 with classrooms: [] and see the
          // NoClassroomWelcome screen via RoleGuard, not a 403. Students
          // missing an approved photo also get a 200, with photoGate.required
          // set, and see PhotoRequiredGate.)
          if (response.status === 403 && data?.error === 'alumni') {
            if (!isCancelled()) {
              setAccessEnded({
                reason: data.error,
                message:
                  data.message ||
                  "You've completed the program and are now a Neram alumnus. Your Nexus access has ended.",
              });
              setUser(null);
              setNexusRole(null);
              setClassrooms([]);
              setActiveClassroomState(null);
              setFeatureFlags(resolveFlags({}));
              setStaffRole(null);
              setCanTeach(true);
              setCapabilities(capabilityMap(null));
              setPhotoGate(DEFAULT_PHOTO_GATE);
              setChildren([]);
              setActiveChildId(null);
            }
            return;
          }
          throw new Error(data.error || `Auth failed: ${response.status}`);
        }

        const data = await response.json();
        if (isCancelled()) return;

        setUser(data.user);
        setNexusRole(data.nexusRole);
        setClassrooms(data.classrooms || []);
        setFeatureFlags(data.featureFlags || resolveFlags({}));
        // Recompute the map from the tier rather than trusting the transmitted
        // one, so a stale or partial payload cannot grant a capability. Falls
        // back to the all-false map when staffRole is absent.
        setStaffRole(data.staffRole ?? null);
        setCanTeach(data.canTeach !== false);
        setCapabilities(capabilityMap(data.staffRole ?? null, data.canTeach !== false));
        // parseWindow again on the client: /me already sanitises, but this keeps
        // the grid safe if the response shape ever drifts.
        setTimetableWindow(parseWindow(data.timetableWindow));
        // Missing field (older server, or a response-shape drift) must never
        // block: fall back to the never-blocking default.
        setPhotoGate(data.photoGate || DEFAULT_PHOTO_GATE);

        // The parent branch of /api/auth/me sends these; every other role sends
        // nothing, so both settle to empty. Keeping them here rather than in each
        // page means a parent page can name the child on first paint with no
        // extra request.
        const linkedChildren: ParentChildRef[] = data.children || [];
        setChildren(linkedChildren);
        setActiveChildId(data.activeChildId ?? linkedChildren[0]?.id ?? null);

        // Restore active classroom from localStorage or use first one. /api/auth/me
        // returns non-archived classrooms with the current academic-year one first,
        // so classrooms[0] is the current cohort.
        const savedClassroomId = localStorage.getItem(ACTIVE_CLASSROOM_KEY);
        const savedClassroom = (data.classrooms || []).find(
          (c: NexusClassroom) => c.id === savedClassroomId
        );
        // Drop a stale saved id that no longer maps to a live classroom (e.g. it was
        // archived at a year-end rollover) so we fall back to the current-year one.
        if (savedClassroomId && !savedClassroom) {
          localStorage.removeItem(ACTIVE_CLASSROOM_KEY);
        }
        setActiveClassroomState(savedClassroom || data.classrooms?.[0] || null);
      } catch (err) {
        if (!isCancelled()) {
          setError(err instanceof Error ? err.message : 'Failed to load user data');
          console.error('Nexus auth error:', err);
        }
      } finally {
        if (!isCancelled()) {
          setDbLoading(false);
        }
      }
    },
    [impersonationToken, parentToken, clearImpersonation]
  );

  // Fetch DB user after MS auth succeeds. Also runs while impersonating (even
  // under the test-mode bypass) so identity swaps to the student via /me.
  useEffect(() => {
    // Skip MSAL auth fetch if test token bypass is active and not impersonating
    if (testMode && !impersonationToken && !parentToken) return;

    // A parent is never expected to have an MSAL user, so this reset block must
    // not fire for them. Without the guard, the moment MSAL reports "no account"
    // it would blank a perfectly valid parent context.
    if (!impersonationToken && !parentToken && (!msUser || msLoading)) {
      setUser(null);
      setNexusRole(null);
      setClassrooms([]);
      setActiveClassroomState(null);
      setFeatureFlags(resolveFlags({}));
      setStaffRole(null);
      setCanTeach(true);
      setCapabilities(capabilityMap(null));
      setPhotoGate(DEFAULT_PHOTO_GATE);
      setChildren([]);
      setActiveChildId(null);
      // Only clear dbLoading if MS auth is definitively done (not loading)
      // so we don't briefly show loading=false with user=null
      if (!msLoading) setDbLoading(false);
      return;
    }

    let cancelled = false;
    loadNexusUser(() => cancelled);
    return () => { cancelled = true; };
  }, [msUser, msLoading, impersonationToken, parentToken, testMode, loadNexusUser]);

  /**
   * Manual re-fetch. The photo blocker calls this after a successful upload so
   * the gate lifts without a full page reload. Never cancels: the caller is an
   * explicit user action, not a mount lifecycle.
   */
  const refreshAuth = useCallback(async () => {
    await loadNexusUser(() => false);
  }, [loadNexusUser]);

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

  // Drop an expired parent session so the UI falls back to the login screen
  // rather than sitting on a dead token and 401-ing every request.
  useEffect(() => {
    if (!parentSession) return;
    const ms = Date.parse(parentSession.expiresAt) - Date.now();
    if (ms <= 0) {
      clearParentSession();
      setParentSession(null);
      return;
    }
    const t = setTimeout(() => {
      clearParentSession();
      setParentSession(null);
    }, ms);
    return () => clearTimeout(t);
  }, [parentSession]);

  const startImpersonation = useCallback(
    async (studentId: string, opts?: { reason?: string; ticketId?: string; returnUrl?: string }) => {
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
        returnUrl: opts?.returnUrl ?? null,
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
    // in hand, before clearing local state. Capped with a short timeout so a
    // stalled request can never block the exit itself (leaving the teacher
    // stuck on "Exiting..." with no way out) - the session is closed on a
    // best-effort basis, not a required one.
    try {
      const raw = sessionStorage.getItem(IMPERSONATION_KEY);
      const parsed = raw ? (JSON.parse(raw) as StoredImpersonation) : null;
      if (parsed?.token) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        await fetch('/api/auth/impersonate/end', {
          method: 'POST',
          headers: { Authorization: `Bearer ${parsed.token}` },
          signal: controller.signal,
        })
          .catch(() => undefined)
          .finally(() => clearTimeout(timeout));
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

  const signIn = useCallback(async () => {
    await msSignIn();
  }, [msSignIn]);

  const signOut = useCallback(async () => {
    const wasParent = !!parentToken;

    setUser(null);
    setNexusRole(null);
    setClassrooms([]);
    setActiveClassroomState(null);
    setAccessEnded(null);
    setFeatureFlags(resolveFlags({}));
    setStaffRole(null);
    setCanTeach(true);
    setCapabilities(capabilityMap(null));
    setPhotoGate(DEFAULT_PHOTO_GATE);
    setChildren([]);
    setActiveChildId(null);
    localStorage.removeItem(ACTIVE_CLASSROOM_KEY);
    clearImpersonation();

    if (wasParent) {
      // Best effort: bump token_version server-side so the session really is
      // dead everywhere, not just cleared from this browser. Parents share
      // devices with their children, so "signed out" has to mean it.
      try {
        await fetch('/api/auth/parent/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${parentToken}` },
        });
      } catch {
        /* the local clear below still signs them out of this device */
      }
      clearParentSession();
      setParentSession(null);
      // Return before msSignOut: a parent never had a Microsoft session, and
      // MSAL would redirect them to a Microsoft logout page they never saw.
      return;
    }

    await msSignOut();
  }, [msSignOut, clearImpersonation, parentToken]);

  /**
   * Sign in with an admin-issued parent login. Setting the session state re-runs
   * the /api/auth/me effect with the parent token, which swaps the whole context
   * to the parent, exactly as startImpersonation does for a student.
   */
  const parentLogin = useCallback(
    async (loginId: string, password: string): Promise<StoredParentSession> => {
      const res = await fetch('/api/auth/parent/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Sign-in failed. Please try again.');
      }

      const stored: StoredParentSession = {
        token: data.token,
        expiresAt: data.expiresAt,
        parent: data.parent,
        mustChangePassword: !!data.mustChangePassword,
      };
      writeParentSession(stored);
      setParentSession(stored);
      return stored;
    },
    []
  );

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
    featureFlags,
    isFeatureEnabled: (id: string) => checkFeatureEnabled(id, featureFlags),
    staffRole,
    canTeach,
    can: (capability: Capability) => capabilities[capability] === true,
    isInternalStaff: isInternalStaffRole(staffRole),
    timetableWindow,
    photoGate,
    refreshAuth,
    // A parent's loading state must NOT be ORed with msLoading. useMicrosoftAuth
    // resolves in all three of its branches so it cannot hang, but a parent
    // would still sit waiting on initializeMsal()'s dynamic import for a result
    // that is then discarded. This is what makes the parent path genuinely
    // MSAL-independent rather than merely MSAL-tolerant.
    loading: testMode || parentToken ? dbLoading : msLoading || dbLoading,
    error,
    accessEnded,
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
      returnUrl: impersonationToken ? impersonationState!.returnUrl ?? null : null,
    },
    startImpersonation,
    exitImpersonation,
    parentSession: {
      active: !!parentToken,
      parent: parentToken ? parentSession!.parent : null,
      mustChangePassword: parentToken ? parentSession!.mustChangePassword : false,
      expiresAt: parentToken ? parentSession!.expiresAt : null,
    },
    parentLogin,
    children,
    activeChildId,
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
