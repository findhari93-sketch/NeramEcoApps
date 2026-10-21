'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';

const AintraPanel = dynamic(() => import('./AintraPanel'), { ssr: false });

interface AintraContextValue {
  open: (question?: string) => void;
  close: () => void;
  isOpen: boolean;
}

const AintraContext = createContext<AintraContextValue | null>(null);

/** The launcher buttons (top bar, sidebar) open Aintra through this. Null outside the signed-in shell. */
export function useAintra(): AintraContextValue | null {
  return useContext(AintraContext);
}

/**
 * Aintra, the Neram assistant, for signed-in students (2026-10-20). Mounted
 * once in StudentSession around the app shell; the panel's code loads only
 * when it is first opened.
 */
export default function AintraProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pending = useRef<string | null>(null);

  const open = useCallback((question?: string) => {
    pending.current = question?.trim() || null;
    setMounted(true);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  // ?aintra=1 (or ?aintra=<question>) opens it, so a notification or a page can link straight in.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('aintra');
      if (q) open(q === '1' ? undefined : q);
    } catch {
      // No URL access: nothing to open.
    }
  }, [open]);

  const value = useMemo(() => ({ open, close, isOpen }), [open, close, isOpen]);
  return (
    <AintraContext.Provider value={value}>
      {children}
      {mounted && <AintraPanel open={isOpen} onClose={close} takeQuestion={() => { const q = pending.current; pending.current = null; return q; }} />}
    </AintraContext.Provider>
  );
}
