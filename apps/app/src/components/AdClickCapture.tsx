'use client';

import { useEffect } from 'react';
import { captureAdClick } from '@/lib/ad-click-capture';

/** Saves a Google Ads click id from the landing URL, so a later sign-up can be credited to the ad. Renders nothing. */
export default function AdClickCapture() {
  useEffect(() => {
    captureAdClick();
  }, []);
  return null;
}
