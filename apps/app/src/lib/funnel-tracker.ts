/**
 * Client-side funnel event tracker
 *
 * Tracks auth, onboarding, and application funnel steps.
 * Queues events and flushes in batches via /api/funnel-events.
 * Uses sendBeacon as fallback for page unload scenarios.
 */

import { collectDeviceInfo } from './device-collector';
import { getDeviceFingerprint } from './device-fingerprint';

interface FunnelEventPayload {
  funnel: 'auth' | 'onboarding' | 'application';
  event: string;
  status: 'started' | 'completed' | 'failed' | 'skipped';
  error_message?: string;
  error_code?: string;
  metadata?: Record<string, unknown>;
  page_url?: string;
}

interface QueuedEvent extends FunnelEventPayload {
  anonymous_id: string;
  device_type: string;
  browser: string;
  os: string;
  source_app: string;
  timestamp: string;
}

let eventQueue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let cachedDeviceInfo: { device_type: string; browser: string; os: string } | null = null;
let cachedFingerprint: string | null = null;
let currentIdToken: string | null = null;

const FLUSH_INTERVAL_MS = 5000;
const SOURCE_APP = 'app';

/**
 * Set the Firebase ID token for authenticated requests
 */
export function setFunnelTrackerToken(token: string | null): void {
  currentIdToken = token;
}

/**
 * Track a funnel event
 */
export async function trackFunnelEvent(payload: FunnelEventPayload): Promise<void> {
  try {
    // Collect device info once and cache
    if (!cachedDeviceInfo) {
      const info = collectDeviceInfo();
      cachedDeviceInfo = {
        device_type: info.device_type,
        browser: info.browser,
        os: info.os,
      };
    }

    // Get fingerprint for anonymous tracking
    if (!cachedFingerprint) {
      cachedFingerprint = await getDeviceFingerprint();
    }

    const event: QueuedEvent = {
      ...payload,
      anonymous_id: cachedFingerprint,
      device_type: cachedDeviceInfo.device_type,
      browser: cachedDeviceInfo.browser,
      os: cachedDeviceInfo.os,
      source_app: SOURCE_APP,
      page_url: payload.page_url || (typeof window !== 'undefined' ? window.location.pathname : undefined),
      timestamp: new Date().toISOString(),
    };

    eventQueue.push(event);

    // Start flush timer if not running
    if (!flushTimer) {
      flushTimer = setTimeout(flushEvents, FLUSH_INTERVAL_MS);
    }
  } catch {
    // Silently fail, don't break the app for tracking
  }
}

/**
 * Flush all queued events to the server
 */
export async function flushEvents(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (eventQueue.length === 0) return;

  const eventsToSend = [...eventQueue];
  eventQueue = [];

  const body = JSON.stringify({
    events: eventsToSend,
    idToken: currentIdToken,
  });

  try {
    await fetch('/api/funnel-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  } catch {
    // Try sendBeacon as fallback
    try {
      navigator.sendBeacon(
        '/api/funnel-events',
        new Blob([body], { type: 'application/json' })
      );
    } catch {
      // Silently fail
    }
  }
}

/**
 * Track event and flush immediately (for critical events like auth completion)
 */
export async function trackFunnelEventImmediate(payload: FunnelEventPayload): Promise<void> {
  await trackFunnelEvent(payload);
  await flushEvents();
}

// Flush on page visibility change or unload
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushEvents();
    }
  });

  window.addEventListener('beforeunload', () => {
    flushEvents();
  });
}
