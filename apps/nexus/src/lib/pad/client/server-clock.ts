'use client';

/**
 * The server's clock on this device, for countdowns and "open for 1:05".
 *
 * A laptop or phone clock can be minutes out, so every time on the pad is
 * read against the server_time of a snapshot. Each snapshot gives one sample:
 * server_time minus the moment it arrived. A slow response makes that sample
 * too small (the server's time is older than "now" by the trip back), so the
 * largest recent sample is the most accurate one.
 */

import { useEffect, useRef, useState } from 'react';

/** Server time minus device time, from one snapshot. */
export function clockSample(serverTime: string, receivedAt: number): number {
  return Date.parse(serverTime) - receivedAt;
}

/** The best of the recent samples: the one from the quickest response. */
export function bestOffset(samples: readonly number[]): number {
  return samples.length ? Math.max(...samples) : 0;
}

/** Whole seconds until closesAt on the server's clock, never below 0; null with no deadline. */
export function secondsLeft(closesAt: string | null | undefined, serverNow: number): number | null {
  if (!closesAt) return null;
  return Math.max(0, Math.ceil((Date.parse(closesAt) - serverNow) / 1_000));
}

/** "0:42", "1:05". */
export function clockLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const SAMPLES_KEPT = 8;

/**
 * The server's "now" in milliseconds, ticking every tickMs while active. Pass
 * each snapshot's server_time; a new value adds a sample.
 */
export function useServerNow(serverTime: string | null | undefined, options: { tickMs?: number; active?: boolean } = {}): number {
  const { tickMs = 250, active = true } = options;
  const samplesRef = useRef<number[]>([]);
  const lastRef = useRef<string | null>(null);

  if (serverTime && serverTime !== lastRef.current) {
    lastRef.current = serverTime;
    samplesRef.current = [...samplesRef.current, clockSample(serverTime, Date.now())].slice(-SAMPLES_KEPT);
  }

  const [deviceNow, setDeviceNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setDeviceNow(Date.now());
    const timer = setInterval(() => setDeviceNow(Date.now()), tickMs);
    return () => clearInterval(timer);
  }, [tickMs, active]);

  return deviceNow + bestOffset(samplesRef.current);
}
