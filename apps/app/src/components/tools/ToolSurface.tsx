'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFirebaseAuth } from '@neram/auth';
import { cutoffPrefillFromSearch } from '@neram/tools-core/cutoff';
import { clearPendingInput, peekPendingInput, type PendingInput } from '@/lib/tools/pending-input';
import type { ToolId } from '@/lib/tools/tool-ids';
import { FULL_TOOLS } from './full-tools';
import ToolSkeleton from './ToolSkeleton';
import { ToolTrialProvider, rememberTrialOpen, trialWasOpen, useTrialOffer, type ToolTrialValue } from './ToolTrial';

interface ToolSurfaceProps {
  toolId: ToolId;
  /** The public part of the page (hero + demo), rendered on the server. */
  children: React.ReactNode;
}

/** Values in the page's own URL (?marks=…), from the chat or the marketing calculator. */
function prefillFromUrl(toolId: ToolId): PendingInput | null {
  if (toolId !== 'nata-cutoff-calculator' || typeof window === 'undefined') return null;
  const parsed = cutoffPrefillFromSearch(window.location.search);
  if (!parsed) return null;
  const out: PendingInput = {};
  for (const [k, v] of Object.entries(parsed)) if (v !== undefined) out[k] = v as string | number;
  return out;
}

/**
 * One URL, two audiences. Signed-out visitors and crawlers get `children` (the
 * server-rendered answer and demo). A signed-in student gets the full tool in
 * the same spot, opened with whatever they typed into the demo.
 *
 * Tools with a free trial (lib/tools/guest-runs.ts) also let a signed-out
 * visitor open the full tool for a few calculations. That happens on a tap in
 * the demo, on a deep link that carries values, or on a refresh of a trial
 * already open in this tab. Never by itself, so the HTML a crawler sees and
 * the page it renders stay the same.
 *
 * While auth is still loading the public part stays rendered, so the server
 * HTML and the first client render match. On a device that was signed in
 * last time, CSS swaps the demo for a skeleton (see lib/auth-hint.ts).
 */
export default function ToolSurface({ toolId, children }: ToolSurfaceProps) {
  const { user, loading } = useFirebaseAuth();
  const signedIn = !loading && !!user;
  const offer = useTrialOffer(toolId);
  const [trialInput, setTrialInput] = useState<PendingInput | null | undefined>(undefined);
  const [urlInput, setUrlInput] = useState<PendingInput | null>(null);

  // A deep link with values, or a trial left open in this tab, opens the full tool.
  useEffect(() => {
    const fromUrl = prefillFromUrl(toolId);
    setUrlInput(fromUrl);
    if (loading || user || !offer.offered) return;
    if (fromUrl) setTrialInput(fromUrl);
    else if (trialWasOpen(toolId)) setTrialInput(null);
  }, [toolId, loading, user, offer.offered]);

  // Read during render (pure), clear after mount so a refresh starts clean.
  const initialInput = useMemo(
    () => (signedIn ? peekPendingInput(toolId) ?? urlInput : null),
    [signedIn, toolId, urlInput]
  );
  useEffect(() => {
    if (signedIn) {
      clearPendingInput(toolId);
      rememberTrialOpen(toolId, false);
    }
  }, [signedIn, toolId]);

  const start = useCallback(
    (input?: PendingInput | null) => {
      rememberTrialOpen(toolId, true);
      setTrialInput(input ?? null);
      window.scrollTo({ top: 0 });
    },
    [toolId]
  );
  const stop = useCallback(() => {
    rememberTrialOpen(toolId, false);
    setTrialInput(undefined);
  }, [toolId]);

  const trial: ToolTrialValue = useMemo(
    () => ({ ...offer, active: trialInput !== undefined, start, stop }),
    [offer, trialInput, start, stop]
  );

  if (signedIn) {
    const Full = FULL_TOOLS[toolId];
    return <Full initialInput={initialInput} />;
  }

  if (trial.active) {
    const Full = FULL_TOOLS[toolId];
    return (
      <ToolTrialProvider value={trial}>
        <Full initialInput={trialInput} />
      </ToolTrialProvider>
    );
  }

  return (
    <ToolTrialProvider value={trial}>
      <div className="public-demo-region">{children}</div>
      <div className="auth-hint-skeleton" aria-hidden="true">
        <ToolSkeleton />
      </div>
    </ToolTrialProvider>
  );
}
