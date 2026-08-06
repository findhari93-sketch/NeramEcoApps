'use client';

/**
 * Report technical failures hit while sitting a test.
 *
 * THE RULES, in priority order, because every one of them exists to stop the
 * reporter from becoming the thing that breaks the test:
 *
 *   1. It never throws. Every path is caught. A student mid-paper must not see
 *      an error about the error reporter.
 *   2. It never blocks. Nothing awaits it, and the take page must never gate a
 *      question on a report being delivered.
 *   3. It de-duplicates. A failing image inside a render loop can fire hundreds
 *      of times a second. One report per (phase, question, message) per sitting
 *      is all anyone needs, and the rest is a self-inflicted denial of service.
 *   4. It batches. Reports are held briefly and sent together, so a paper where
 *      eight figures are missing costs one request rather than eight.
 *
 * Deliberately NOT wired into GlobalErrorLogger: that posts to /api/diagnostics
 * and is about the app. This is about ONE PAPER, and its whole value is that a
 * teacher can open a test and see what failed inside it.
 */

import { useCallback, useEffect, useRef } from 'react';

export type TestErrorPhase = 'load' | 'render' | 'image' | 'submit' | 'grade';

export interface TestErrorReport {
  phase: TestErrorPhase;
  message: string;
  question_id?: string | null;
  attempt_id?: string | null;
  detail?: unknown;
}

/** How long reports are held before being flushed together. */
const BATCH_MS = 1500;

export function useTestErrorReporter({
  testId,
  classroomId,
  getToken,
}: {
  testId: string | null | undefined;
  classroomId?: string | null;
  getToken: () => Promise<string | null>;
}) {
  const seen = useRef<Set<string>>(new Set());
  const queue = useRef<TestErrorReport[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    const batch = queue.current;
    queue.current = [];
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (batch.length === 0 || !testId) return;

    try {
      const token = await getToken();
      if (!token) return;
      await fetch('/api/student/tests/errors', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ test_id: testId, classroom_id: classroomId ?? null, errors: batch }),
        // Survives the page being closed, which is precisely when a submit
        // failure is most likely to be the last thing that happened.
        keepalive: true,
      });
    } catch {
      // Deliberately silent. Losing a diagnostic is acceptable; showing a
      // student an error about error reporting is not.
    }
  }, [testId, classroomId, getToken]);

  const report = useCallback(
    (input: TestErrorReport) => {
      try {
        if (!testId || !input?.phase || !input?.message) return;

        // One report per distinct failure per sitting. A render loop firing the
        // same error hundreds of times a second is the normal case, not the
        // exception.
        const key = `${input.phase}|${input.question_id || ''}|${input.message}`;
        if (seen.current.has(key)) return;
        seen.current.add(key);

        queue.current.push(input);
        if (!timer.current) timer.current = setTimeout(() => void flush(), BATCH_MS);
      } catch {
        // See rule 1.
      }
    },
    [testId, flush],
  );

  // Anything still queued when the student leaves goes out on unload. `flush`
  // uses keepalive, so the browser is allowed to finish the request after the
  // page is gone.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      void flush();
    };
  }, [flush]);

  return { report, flush };
}
