'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { guestRunLimit, guestRunState, recordGuestRun, type GuestRunState } from '@/lib/tools/guest-runs';
import type { PendingInput } from '@/lib/tools/pending-input';

/**
 * The free trial of a full tool for signed-out visitors (lib/tools/guest-runs.ts).
 *
 * ToolSurface provides this. The public demo reads it to offer "Use the full
 * calculator free", and the full tool reads it to know it is running as a
 * guest and to blur a result once the free calculations are spent.
 *
 * The trial only ever opens on a tap or on a deep link with values in it, never
 * by itself: a crawler (empty storage on every visit) must always see the same
 * server-rendered demo the HTML carries.
 */
export interface ToolTrialValue {
  /** This tool has a trial and storage works, so it can be offered. */
  offered: boolean;
  /** Free calculations left on this device. */
  remaining: number;
  limit: number;
  /** The full tool is open as a guest. */
  active: boolean;
  start: (input?: PendingInput | null) => void;
  stop: () => void;
}

const ToolTrialContext = createContext<ToolTrialValue | null>(null);

export const ToolTrialProvider = ToolTrialContext.Provider;

/** Null outside ToolSurface, or for a signed-in student. */
export function useToolTrial(): ToolTrialValue | null {
  return useContext(ToolTrialContext);
}

const OPEN_KEY = (toolId: string) => `neram_tool_trial_open:${toolId}`;

/** Remembers that the trial is open, for this tab only, so a refresh keeps the full tool. */
export function rememberTrialOpen(toolId: string, open: boolean) {
  try {
    if (open) window.sessionStorage.setItem(OPEN_KEY(toolId), '1');
    else window.sessionStorage.removeItem(OPEN_KEY(toolId));
  } catch {
    // Private mode: a refresh goes back to the demo, which is fine.
  }
}

export function trialWasOpen(toolId: string): boolean {
  try {
    return window.sessionStorage.getItem(OPEN_KEY(toolId)) === '1';
  } catch {
    return false;
  }
}

/** How many free calculations are left, read after mount (storage is client-only). */
export function useTrialOffer(toolId: string): { offered: boolean; remaining: number; limit: number } {
  const limit = guestRunLimit(toolId);
  const [offer, setOffer] = useState({ offered: false, remaining: 0, limit });
  useEffect(() => {
    const s = guestRunState(toolId, null);
    setOffer({ offered: s.available && s.limit > 0, remaining: s.remaining, limit: s.limit });
  }, [toolId]);
  return offer;
}

/**
 * Inside the full tool: counts settled inputs as runs and says whether this
 * result is past the free limit. `fingerprint` is null while nothing is entered.
 * Typing is not a run; inputs that stay put for `settleMs` are.
 */
export function useGuestRunGate(toolId: string, fingerprint: string | null, enabled: boolean, settleMs = 1200): GuestRunState {
  const [version, setVersion] = useState(0);
  // Read synchronously so a locked result never flashes before it blurs.
  // The full tools are client-only (ssr: false), so storage is always there.
  const state = useMemo(
    () => (enabled ? guestRunState(toolId, fingerprint) : { available: false, limit: 0, used: 0, remaining: 0, locked: false }),
    // version re-reads storage after a run is recorded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toolId, fingerprint, enabled, version]
  );

  const record = useCallback(() => {
    if (!fingerprint) return;
    recordGuestRun(toolId, fingerprint);
    setVersion((v) => v + 1);
  }, [toolId, fingerprint]);

  useEffect(() => {
    if (!enabled || !fingerprint || state.locked) return;
    const t = setTimeout(record, settleMs);
    return () => clearTimeout(t);
  }, [enabled, fingerprint, state.locked, record, settleMs]);

  return state;
}
