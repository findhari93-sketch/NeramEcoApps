'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

export type SidebarState = 'expanded' | 'icons' | 'hidden';

export const SIDEBAR_EXPANDED = 260;
export const SIDEBAR_ICONS = 72;
export const SIDEBAR_HIDDEN = 0;

const STORAGE_KEY = 'nexus_sidebar_state';

export function getSidebarWidth(state: SidebarState): number {
  switch (state) {
    case 'expanded': return SIDEBAR_EXPANDED;
    case 'icons': return SIDEBAR_ICONS;
    case 'hidden': return SIDEBAR_HIDDEN;
  }
}

interface SidebarContextValue {
  sidebarState: SidebarState;
  setSidebarState: (state: SidebarState) => void;
  sidebarWidth: number;
  /** Single click: cycles expanded → icons → hidden → expanded */
  cycle: () => void;
  /** Double-click: jump to opposite extreme (expanded/icons → hidden, hidden → expanded) */
  toggle: () => void;
  /** Always go to expanded */
  expand: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  sidebarState: 'expanded',
  setSidebarState: () => {},
  sidebarWidth: SIDEBAR_EXPANDED,
  cycle: () => {},
  toggle: () => {},
  expand: () => {},
});

export function useSidebarContext() {
  return useContext(SidebarContext);
}

export default function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SidebarState>('expanded');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as SidebarState | null;
    if (saved && ['expanded', 'icons', 'hidden'].includes(saved)) {
      setState(saved);
    }
    setHydrated(true);
  }, []);

  const setSidebarState = useCallback((newState: SidebarState) => {
    setState(newState);
    localStorage.setItem(STORAGE_KEY, newState);
  }, []);

  // Single click: cycle forward (expanded → icons → hidden → expanded)
  const cycle = useCallback(() => {
    setState((prev) => {
      const next: SidebarState =
        prev === 'expanded' ? 'icons' :
        prev === 'icons' ? 'hidden' :
        'expanded';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  // Double-click: jump to opposite extreme
  const toggle = useCallback(() => {
    setState((prev) => {
      const next: SidebarState = prev === 'hidden' ? 'expanded' : 'hidden';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  // Always go to expanded
  const expand = useCallback(() => {
    setState('expanded');
    localStorage.setItem(STORAGE_KEY, 'expanded');
  }, []);

  const value = useMemo<SidebarContextValue>(() => ({
    sidebarState: state,
    setSidebarState,
    sidebarWidth: hydrated ? getSidebarWidth(state) : SIDEBAR_EXPANDED,
    cycle,
    toggle,
    expand,
  }), [state, hydrated, setSidebarState, cycle, toggle, expand]);

  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  );
}
