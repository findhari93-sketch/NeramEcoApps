'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useMediaQuery, useTheme } from '@neram/ui';

interface SidebarContextValue {
  collapsed: boolean;
  toggleSidebar: () => void;
  sidebarWidth: number;
  isMobile: boolean;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

const EXPANDED_WIDTH = 240;
const COLLAPSED_WIDTH = 56;
const STORAGE_KEY = 'neram-admin-sidebar-collapsed';

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  toggleSidebar: () => {},
  sidebarWidth: EXPANDED_WIDTH,
  isMobile: false,
  mobileOpen: false,
  setMobileOpen: () => {},
});

export function SidebarProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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

  // Close mobile drawer when switching to desktop
  useEffect(() => {
    if (!isMobile) {
      setMobileOpen(false);
    }
  }, [isMobile]);

  const toggleSidebar = () => {
    if (isMobile) {
      setMobileOpen((prev) => !prev);
    } else {
      setCollapsed((prev) => !prev);
    }
  };

  return (
    <SidebarContext.Provider
      value={{
        collapsed,
        toggleSidebar,
        sidebarWidth: isMobile ? 0 : collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
        isMobile,
        mobileOpen,
        setMobileOpen,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
