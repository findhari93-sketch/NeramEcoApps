'use client';

import { useEffect } from 'react';
import { captureAttributionFromUrl, captureTouch } from '@/lib/attribution';

export default function AttributionCapture() {
  useEffect(() => {
    captureAttributionFromUrl();
    captureTouch();
  }, []);
  return null;
}
