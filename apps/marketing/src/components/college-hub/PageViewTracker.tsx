'use client';

import { useEffect, useRef } from 'react';

interface PageViewTrackerProps {
  collegeId: string;
}

export default function PageViewTracker({ collegeId }: PageViewTrackerProps) {
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current || !collegeId) return;
    tracked.current = true;

    // Fire-and-forget: failure is silent
    fetch('/api/colleges/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ college_id: collegeId }),
    }).catch(() => undefined);
  }, [collegeId]);

  return null;
}
