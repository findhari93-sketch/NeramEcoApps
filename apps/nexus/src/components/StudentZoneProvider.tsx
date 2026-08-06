'use client';

/**
 * Which student zone is active (Study Zone / Classroom), and the nav lists that
 * zone hands to the sidebar and the bottom bar.
 *
 * The lists themselves live in `@/lib/nav-config`, as plain data. This file only
 * decides which zone is showing and applies the feature-flag gate.
 *
 * The "More" sheet is DERIVED from the same groups the sidebar renders, so a new
 * nav item is reachable on a phone the moment it is added. See the header of
 * nav-config.tsx for why that matters.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { isPathEnabled } from '@/lib/feature-flags';
import {
  ZONES,
  groupNavItems,
  zoneOverflow,
  QB_PATH,
  STUDY_MATERIALS_PATH,
  SELF_LEARNING_PATH,
  CLASS_RECAP_PATH,
  COURSE_PLAN_PATH,
  ASSIGNMENTS_PATH,
  CATCHUP_PATH,
  type NavGroup,
  type NavItem,
  type StudentZoneId,
  type ZoneConfig,
} from '@/lib/nav-config';

export type { StudentZoneId } from '@/lib/nav-config';

const STORAGE_KEY = 'nexus_student_zone';

/**
 * Only routes that are EXCLUSIVE to a zone force an auto-switch. Shared routes (library,
 * qb, checklist live in both) return null so the active zone is preserved.
 */
function detectZoneFromPath(pathname: string): StudentZoneId | null {
  if (
    pathname.startsWith(STUDY_MATERIALS_PATH) ||
    pathname.startsWith(SELF_LEARNING_PATH) ||
    pathname.startsWith(CLASS_RECAP_PATH)
  )
    return 'study';
  const classroomExclusive = [
    '/student/dashboard',
    '/student/timetable',
    COURSE_PLAN_PATH,
    ASSIGNMENTS_PATH,
    CATCHUP_PATH,
    '/student/tests',
    '/student/drawings',
    '/student/exam-recall',
    '/student/documents',
    '/student/reviews',
    '/student/exams',
    '/student/issues',
  ];
  if (classroomExclusive.some((p) => pathname.startsWith(p))) return 'classroom';
  return null;
}

interface StudentZoneContextValue {
  activeZone: StudentZoneId;
  setActiveZone: (zone: StudentZoneId) => void;
  availableZones: {
    id: StudentZoneId;
    label: string;
    icon: React.ReactNode;
    badgePath?: string;
  }[];
  currentNavGroups: NavGroup[];
  currentBottomNavItems: NavItem[];
  /** Flattened "More" sheet, for anything that wants a plain list. */
  currentOverflowItems: NavItem[];
  /** The same items under their headings, which is what BottomNav renders. */
  currentOverflowGroups: NavGroup[];
  currentHomePath: string;
  currentZoneTitle: string;
}

const StudentZoneContext = createContext<StudentZoneContextValue>({
  activeZone: 'classroom',
  setActiveZone: () => {},
  availableZones: [],
  currentNavGroups: [],
  currentBottomNavItems: [],
  currentOverflowItems: [],
  currentOverflowGroups: [],
  currentHomePath: '/student/dashboard',
  currentZoneTitle: 'Classroom',
});

export function useStudentZoneContext() {
  return useContext(StudentZoneContext);
}

export default function StudentZoneProvider({
  children,
  isQBEnabled = true,
}: {
  children: React.ReactNode;
  isQBEnabled?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { featureFlags } = useNexusAuthContext();
  // Default to Study Zone (first paint, before localStorage hydration / URL
  // detection). A saved zone or a zone-exclusive URL still overrides this.
  const [activeZone, setActiveZoneState] = useState<StudentZoneId>('study');
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as StudentZoneId | null;
    if (saved && ZONES.some((z) => z.id === saved)) {
      setActiveZoneState(saved);
    }
    setHydrated(true);
  }, []);

  // Auto-sync zone from the URL (zone-exclusive routes only).
  useEffect(() => {
    if (!hydrated) return;
    const detected = detectZoneFromPath(pathname);
    if (detected && detected !== activeZone) {
      setActiveZoneState(detected);
      localStorage.setItem(STORAGE_KEY, detected);
    }
  }, [pathname, hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  const setActiveZone = useCallback(
    (zone: StudentZoneId) => {
      const config = ZONES.find((z) => z.id === zone);
      if (!config) return;
      setActiveZoneState(zone);
      localStorage.setItem(STORAGE_KEY, zone);
      router.push(config.defaultPath);
    },
    [router],
  );

  // Filter nav by the admin feature flags. Disabled features are stripped from
  // the sidebar/bottom-nav; empty groups and empty zones disappear. Question
  // Bank carries an extra per-classroom gate (isQBEnabled) on top of its global
  // flag, so it shows only when BOTH are on.
  const value = useMemo<StudentZoneContextValue>(() => {
    const isItemEnabled = (path: string) => {
      if (path === QB_PATH && !isQBEnabled) return false;
      return isPathEnabled(path, featureFlags);
    };
    const filterGroups = (groups: NavGroup[]) =>
      groups
        .map((g) => ({ ...g, items: g.items.filter((i) => isItemEnabled(i.path)) }))
        .filter((g) => g.items.length > 0);
    const filterItems = (items: NavItem[]) => items.filter((i) => isItemEnabled(i.path));

    const zoneHasContent = (z: ZoneConfig) =>
      filterItems(z.bottomNavItems).length > 0 ||
      filterItems(zoneOverflow(z)).length > 0 ||
      filterGroups(z.navGroups).length > 0;

    const available = ZONES.filter(zoneHasContent);
    // Resolve the zone to actually render. If the active zone was stripped by
    // feature flags (e.g. Study Zone disabled), fall back to the first available
    // zone so the sidebar/pill never end up empty or mis-highlighted.
    const effective =
      available.find((z) => z.id === activeZone) ||
      available[0] ||
      ZONES.find((z) => z.id === 'classroom') ||
      ZONES[0];

    // Filter first, group second, so a heading whose every item is switched off
    // does not render over an empty section.
    const overflow = filterItems(zoneOverflow(effective));

    return {
      activeZone: effective.id,
      setActiveZone,
      availableZones: available.map((z) => ({
        id: z.id,
        label: z.label,
        icon: z.icon,
        badgePath: z.badgePath,
      })),
      currentNavGroups: filterGroups(effective.navGroups),
      currentBottomNavItems: filterItems(effective.bottomNavItems),
      currentOverflowItems: overflow,
      currentOverflowGroups: groupNavItems(overflow),
      currentHomePath: effective.defaultPath,
      currentZoneTitle: effective.title,
    };
  }, [activeZone, setActiveZone, isQBEnabled, featureFlags]);

  return <StudentZoneContext.Provider value={value}>{children}</StudentZoneContext.Provider>;
}
