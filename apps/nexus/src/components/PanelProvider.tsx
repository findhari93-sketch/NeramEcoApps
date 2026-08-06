'use client';

/**
 * Which staff panel is active (Teaching / Management / Admin), and the nav lists
 * that panel hands to the sidebar and the bottom bar.
 *
 * The lists themselves live in `@/lib/nav-config`, as plain data. This file only
 * decides which panel is showing and applies the two gates: the feature flag
 * ("is this switched on yet") and the capability ("may this person use it").
 *
 * The bottom bar and the "More" sheet are DERIVED from the same array the
 * sidebar renders, so a new nav item is reachable on a phone the moment it is
 * added. See the header of nav-config.tsx for why that matters.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { isPathEnabled } from '@/lib/feature-flags';
import {
  PANELS,
  groupNavItems,
  panelBottomNav,
  panelOverflow,
  type NavGroup,
  type NavItem,
  type PanelId,
} from '@/lib/nav-config';

export type { PanelId } from '@/lib/nav-config';
export { COURSE_PLANS_PATH, COURSE_PLAN_SUBNAV } from '@/lib/nav-config';

// Map paths to panels for URL-based auto-sync
const PATH_TO_PANEL: Record<string, PanelId> = {};
for (const panel of PANELS) {
  for (const item of panel.sidebarItems) {
    PATH_TO_PANEL[item.path] = panel.id;
  }
}

function detectPanelFromPath(pathname: string): PanelId | null {
  // Check exact match first
  if (PATH_TO_PANEL[pathname]) return PATH_TO_PANEL[pathname];

  // Check prefix match (e.g., /teacher/classrooms/123 → management)
  if (pathname.startsWith('/teacher/drawing-reviews')) return 'teaching';
  if (pathname.startsWith('/teacher/curriculum')) return 'teaching';
  if (pathname.startsWith('/teacher/course-plans')) return 'teaching';
  if (pathname.startsWith('/teacher/exam-schedule')) return 'teaching';
  if (pathname.startsWith('/teacher/exams')) return 'teaching';
  if (pathname.startsWith('/teacher/admin/')) return 'admin';
  // Student sub-pages: city-wise drill-down, inactivity watchlist, detail
  if (pathname.startsWith('/teacher/students')) return 'management';
  if (pathname.startsWith('/teacher/photo-review')) return 'management';
  // Review campaign pages
  if (pathname.startsWith('/teacher/reviews')) return 'management';
  // Foundation pages are still accessible via Module Library (management panel)
  if (pathname.startsWith('/teacher/foundation')) return 'management';
  // Library pages (review, engagement, collections)
  if (pathname.startsWith('/teacher/library')) return 'management';
  // Exam recall moderation pages
  if (pathname.startsWith('/teacher/exam-recall')) return 'management';

  for (const [path, panelId] of Object.entries(PATH_TO_PANEL)) {
    if (pathname.startsWith(path + '/')) return panelId;
  }

  return null;
}

const STORAGE_KEY = 'nexus_active_panel';

interface PanelContextValue {
  activePanel: PanelId;
  setActivePanel: (panelId: PanelId) => void;
  availablePanels: { id: PanelId; label: string; icon: React.ReactNode }[];
  currentPanelTitle: string;
  currentSidebarItems: NavItem[];
  currentBottomNavItems: NavItem[];
  /** Flattened "More" sheet, for anything that wants a plain list. */
  currentOverflowItems: NavItem[];
  /** The same items under their headings, which is what BottomNav renders. */
  currentOverflowGroups: NavGroup[];
}

const PanelContext = createContext<PanelContextValue>({
  activePanel: 'teaching',
  setActivePanel: () => {},
  availablePanels: [],
  currentPanelTitle: 'Classroom Teaching',
  currentSidebarItems: [],
  currentBottomNavItems: [],
  currentOverflowItems: [],
  currentOverflowGroups: [],
});

export function usePanelContext() {
  return useContext(PanelContext);
}

export default function PanelProvider({ children }: { children: React.ReactNode }) {
  const { nexusRole, featureFlags, can } = useNexusAuthContext();
  const pathname = usePathname();
  const router = useRouter();
  const [activePanel, setActivePanelState] = useState<PanelId>('teaching');
  const [hydrated, setHydrated] = useState(false);

  // Filter panels by role AND by feature flags: a panel whose every nav item is
  // disabled disappears from the switcher (its pages are still blocked by
  // FeatureGate). The Admin panel is all-core so it never drops.
  // An item must clear BOTH gates: the feature flag (is it switched on) and the
  // capability (may this person use it).
  const isItemVisible = useCallback(
    (i: NavItem) => isPathEnabled(i.path, featureFlags) && (!i.capability || can(i.capability)),
    [featureFlags, can],
  );

  const availablePanels = useMemo(() => {
    return PANELS.filter((p) => nexusRole && p.requiredRoles.includes(nexusRole)).filter(
      (p) => p.sidebarItems.some(isItemVisible),
    );
  }, [nexusRole, isItemVisible]);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as PanelId | null;
    if (saved && PANELS.some((p) => p.id === saved)) {
      // Validate the user has access to the saved panel
      const hasAccess = nexusRole && PANELS.find((p) => p.id === saved)?.requiredRoles.includes(nexusRole);
      if (hasAccess) {
        setActivePanelState(saved);
      }
    }
    setHydrated(true);
  }, [nexusRole]);

  // Auto-sync panel from URL changes
  useEffect(() => {
    if (!hydrated) return;
    const detected = detectPanelFromPath(pathname);
    if (detected && detected !== activePanel) {
      // Validate access
      const hasAccess = nexusRole && PANELS.find((p) => p.id === detected)?.requiredRoles.includes(nexusRole);
      if (hasAccess) {
        setActivePanelState(detected);
        localStorage.setItem(STORAGE_KEY, detected);
      }
    }
  }, [pathname, hydrated, nexusRole]); // eslint-disable-line react-hooks/exhaustive-deps

  const setActivePanel = useCallback((panelId: PanelId) => {
    const panel = PANELS.find((p) => p.id === panelId);
    if (!panel) return;

    // Validate access
    if (nexusRole && !panel.requiredRoles.includes(nexusRole)) return;

    setActivePanelState(panelId);
    localStorage.setItem(STORAGE_KEY, panelId);
    router.push(panel.defaultPath);
  }, [nexusRole, router]);

  const currentPanel = PANELS.find((p) => p.id === activePanel) || PANELS[0];

  const value = useMemo<PanelContextValue>(() => {
    const filterItems = (items: NavItem[]) => items.filter(isItemVisible);
    // If the active panel got fully filtered out (every feature off), fall back
    // to the first still-available panel so staff are never stranded on an empty
    // sidebar.
    const resolvedPanel =
      filterItems(currentPanel.sidebarItems).length > 0
        ? currentPanel
        : availablePanels[0] || currentPanel;

    // Filter first, group second, so a heading whose every item is switched off
    // does not render over an empty section.
    const overflow = filterItems(panelOverflow(resolvedPanel));

    return {
      activePanel: resolvedPanel.id,
      setActivePanel,
      availablePanels: availablePanels.map((p) => ({ id: p.id, label: p.label, icon: p.icon })),
      currentPanelTitle: resolvedPanel.title,
      currentSidebarItems: filterItems(resolvedPanel.sidebarItems),
      currentBottomNavItems: filterItems(panelBottomNav(resolvedPanel)),
      currentOverflowItems: overflow,
      currentOverflowGroups: groupNavItems(overflow),
    };
  }, [setActivePanel, availablePanels, currentPanel, isItemVisible]);

  return (
    <PanelContext.Provider value={value}>
      {children}
    </PanelContext.Provider>
  );
}
