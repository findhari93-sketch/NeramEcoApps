'use client';

import { useEffect, useMemo } from 'react';
import { useFirebaseAuth } from '@neram/auth';
import { clearPendingInput, peekPendingInput } from '@/lib/tools/pending-input';
import type { ToolId } from '@/lib/tools/tool-ids';
import { FULL_TOOLS } from './full-tools';
import ToolSkeleton from './ToolSkeleton';

interface ToolSurfaceProps {
  toolId: ToolId;
  /** The public part of the page (hero + demo), rendered on the server. */
  children: React.ReactNode;
}

/**
 * One URL, two audiences. Signed-out visitors and crawlers get `children` (the
 * server-rendered answer and demo). A signed-in student gets the full tool in
 * the same spot, opened with whatever they typed into the demo.
 *
 * While auth is still loading the public part stays rendered, so the server
 * HTML and the first client render match. On a device that was signed in
 * last time, CSS swaps the demo for a skeleton (see lib/auth-hint.ts).
 */
export default function ToolSurface({ toolId, children }: ToolSurfaceProps) {
  const { user, loading } = useFirebaseAuth();
  const signedIn = !loading && !!user;

  // Read during render (pure), clear after mount so a refresh starts clean.
  const initialInput = useMemo(() => (signedIn ? peekPendingInput(toolId) : null), [signedIn, toolId]);
  useEffect(() => {
    if (signedIn) clearPendingInput(toolId);
  }, [signedIn, toolId]);

  if (signedIn) {
    const Full = FULL_TOOLS[toolId];
    return <Full initialInput={initialInput} />;
  }

  return (
    <>
      <div className="public-demo-region">{children}</div>
      <div className="auth-hint-skeleton" aria-hidden="true">
        <ToolSkeleton />
      </div>
    </>
  );
}
