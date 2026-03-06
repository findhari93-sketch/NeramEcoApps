'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface SidebarContextValue {
  collapsed: boolean;
  toggleSidebar: () => void;
  sidebarWidth: number;
}

const EXPANDED_WIDTH = 220;
const COLLAPSED_WIDTH = 52;
const STORAGE_KEY = 'neram-app-sidebar-collapsed';

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  toggleSidebar: () => {},
  sidebarWidth: EXPANDED_WIDTH,
});

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') {
      setCollapsed(true);
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
    }
  }, [collapsed, mounted]);

  const toggleSidebar = () => setCollapsed((prev) => !prev);

  return (
    <SidebarContext.Provider
      value={{
        collapsed,
        toggleSidebar,
        sidebarWidth: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}

export { EXPANDED_WIDTH, COLLAPSED_WIDTH };
