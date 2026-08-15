'use client';

/**
 * Proctoring signals for a proctoring_enabled exam sitting.
 *
 * Best-effort fullscreen, plus tab-switch / window-blur / fullscreen-exit
 * detection, each reported to POST /api/tests/attempt/violation. THE SERVER,
 * NOT THIS HOOK'S OWN TALLY, DECIDES whether a sitting has crossed
 * nexus_exams.violation_limit -- the same "server decides, client only
 * proposes" principle as class-prep-gate.ts. This hook shows an optimistic
 * count immediately and then reconciles against whatever the server answers.
 *
 * Deliberately does NOT reuse the video player's useFullscreen.ts: that
 * hook's CSS pseudo-fullscreen fallback for iOS would look enforced here when
 * nothing actually is, which would be dishonest about what this feature can
 * and cannot do.
 *
 * NEVER blocks test start. A browser without Fullscreen API support (notably
 * iOS Safari, which has none for arbitrary content) simply never shows the
 * gate and relies on tab-switch/blur detection alone -- see fullscreenSupported.
 */

import { useCallback, useEffect, useState } from 'react';

export type ProctoringViolationKind = 'tab_switch' | 'window_blur' | 'fullscreen_exit';

export interface UseTestProctoringOptions {
  attemptId: string | null;
  enabled: boolean;
  getToken: () => Promise<string | null>;
  /** The paper is on screen and can be interacted with (!loading && !submitted). */
  active: boolean;
  /** Fired immediately on every logged violation, to drive a warning toast. */
  onViolation: (kind: ProctoringViolationKind, count: number, limit: number | null) => void;
  /** Fired once the server says this sitting has crossed the violation limit. */
  onThresholdReached: () => void;
}

export interface ProctoringState {
  fullscreenSupported: boolean;
  /** Show the fullscreen interstitial before (or after re-exiting) the paper. */
  needsFullscreenGate: boolean;
  violationCount: number;
  enterFullscreen: () => Promise<void>;
}

export function useTestProctoring({
  attemptId,
  enabled,
  getToken,
  active,
  onViolation,
  onThresholdReached,
}: UseTestProctoringOptions): ProctoringState {
  const [fullscreenSupported] = useState(
    () =>
      typeof document !== 'undefined' &&
      document.fullscreenEnabled === true &&
      typeof document.documentElement.requestFullscreen === 'function',
  );
  const [isFullscreen, setIsFullscreen] = useState(
    () => typeof document !== 'undefined' && !!document.fullscreenElement,
  );
  const [violationCount, setViolationCount] = useState(0);

  // A fresh attempt (a resubmit's "Try again") starts its own count.
  useEffect(() => {
    setViolationCount(0);
  }, [attemptId]);

  const enterFullscreen = useCallback(async () => {
    try {
      // The Fullscreen API requires a user gesture; the interstitial's button
      // click IS that gesture. Best-effort: on failure the paper still opens,
      // it just relies on tab-switch/blur detection alone for this sitting.
      await document.documentElement.requestFullscreen();
    } catch {
      // Swallowed on purpose -- see the comment above.
    }
  }, []);

  useEffect(() => {
    if (!fullscreenSupported) return;
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [fullscreenSupported]);

  const needsFullscreenGate = enabled && fullscreenSupported && !isFullscreen;

  const report = useCallback(
    async (kind: ProctoringViolationKind) => {
      if (!attemptId) return;
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch('/api/tests/attempt/violation', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ attempt_id: attemptId, kind }),
          // Survives a tab-switch/close that happens in the same tick as the
          // violation itself, which is exactly the case this exists to catch.
          keepalive: true,
        });
        const json = await res.json().catch(() => null);
        if (typeof json?.violation_count !== 'number') return;
        setViolationCount(json.violation_count);
        onViolation(kind, json.violation_count, typeof json.limit === 'number' ? json.limit : null);
        if (json.should_auto_submit) onThresholdReached();
      } catch {
        // Best-effort telemetry, same posture as useTestErrorReporter: never
        // throw into the take page over a lost proctoring signal.
      }
    },
    [attemptId, getToken, onViolation, onThresholdReached],
  );

  // Gated on !needsFullscreenGate: a tab switch while the "start in
  // fullscreen" interstitial is still showing is not yet inside the paper and
  // must not count. Exiting fullscreen mid-test flips needsFullscreenGate back
  // to true (see isFullscreen above), which both stops these listeners AND
  // re-shows the interstitial as the way back in.
  useEffect(() => {
    if (!enabled || !active || needsFullscreenGate) return;

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void report('tab_switch');
    };
    // visibilitychange already covers switching tabs/apps on most platforms;
    // blur catches the desktop alt-tab case where the document stays
    // "visible" but the window itself loses focus.
    const onBlur = () => {
      if (document.visibilityState !== 'hidden') void report('window_blur');
    };
    const onFullscreenExit = () => {
      if (!document.fullscreenElement) void report('fullscreen_exit');
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    if (fullscreenSupported) document.addEventListener('fullscreenchange', onFullscreenExit);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      if (fullscreenSupported) document.removeEventListener('fullscreenchange', onFullscreenExit);
    };
  }, [enabled, active, needsFullscreenGate, fullscreenSupported, report]);

  return { fullscreenSupported, needsFullscreenGate, violationCount, enterFullscreen };
}
