'use client';

import { useCallback, useState } from 'react';

/**
 * Open a class's Teams meeting through the server.
 *
 * Why this is not a plain `<a href>`: once the prep gate is armed the join URL is
 * stripped from every student payload, so the link has to be fetched from
 * /api/timetable/[classId]/join, which needs an Authorization header. An anchor
 * cannot send one.
 *
 * Why the window is opened BEFORE the fetch: Safari and iOS Chrome block
 * window.open once the call stack has left the user's gesture, so the obvious
 * `await fetch(...)` then `window.open(url)` silently does nothing on exactly the
 * devices most students use. Opening a blank tab synchronously on the tap keeps
 * the gesture, and the location is set when the response lands. On a refusal the
 * blank tab is closed again, which is why the tab is tracked rather than fired
 * and forgotten.
 *
 * The alternative, a short-lived signed token in the href, would put a
 * bearer-shaped secret in a URL that ends up in history and referrers. Not worth
 * it to avoid one `window.open('')`.
 */
export interface JoinRefusal {
  code: string;
  message: string;
  blockers: string[];
}

export function useJoinClass(getToken: () => Promise<string | null>) {
  const [joining, setJoining] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<JoinRefusal | null>(null);

  const join = useCallback(
    async (classId: string) => {
      setRefusal(null);
      setJoining(classId);

      // Synchronous, inside the gesture. Null when a blocker stopped even this,
      // in which case we fall back to navigating the current tab.
      const tab = typeof window !== 'undefined' ? window.open('', '_blank') : null;

      try {
        const token = await getToken();
        const res = await fetch(`/api/timetable/${classId}/join`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.join_url) {
          tab?.close();
          setRefusal({
            code: data.code || 'JOIN_FAILED',
            message: data.error || 'Could not open the class',
            blockers: data.blockers || [],
          });
          return false;
        }

        if (tab) {
          tab.location.href = data.join_url;
        } else {
          window.location.href = data.join_url;
        }
        return true;
      } catch {
        tab?.close();
        setRefusal({ code: 'JOIN_FAILED', message: 'Could not open the class', blockers: [] });
        return false;
      } finally {
        setJoining(null);
      }
    },
    [getToken],
  );

  return { join, joining, refusal, clearRefusal: () => setRefusal(null) };
}
