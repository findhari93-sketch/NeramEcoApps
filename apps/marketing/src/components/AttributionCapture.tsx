'use client';

import { useEffect } from 'react';
import { captureAttributionFromUrl } from '@/lib/attribution';

export default function AttributionCapture() {
  useEffect(() => {
    captureAttributionFromUrl();
  }, []);
  return null;
}
