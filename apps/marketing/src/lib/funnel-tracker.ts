/**
 * Client-side funnel event tracker for marketing site
 *
 * Tracks auth funnel steps for cross-domain auth flows.
 * Queues events and flushes in batches via /api/funnel-events.
 * Uses sendBeacon as fallback for page unload scenarios.
 */

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
  anonymous_id: string | null;
  device_type: string;
  browser: string;
  os: string;
  source_app: string;
  timestamp: string;
}

let eventQueue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let cachedDeviceInfo: { device_type: string; browser: string; os: string } | null = null;

const FLUSH_INTERVAL_MS = 5000;
const SOURCE_APP = 'marketing';

function getBasicDeviceInfo(): { device_type: string; browser: string; os: string } {
  if (typeof navigator === 'undefined') return { device_type: 'unknown', browser: 'unknown', os: 'unknown' };

  const ua = navigator.userAgent;
  let browser = 'Unknown';
  let os = 'Unknown';
  let device_type = 'desktop';

  if (/mobile|iphone|ipod|android.*mobile/i.test(ua)) device_type = 'mobile';
  else if (/tablet|ipad/i.test(ua)) device_type = 'tablet';

  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Edge';

  if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';

  return { device_type, browser, os };
}

/**
 * Track a funnel event
 */
export function trackFunnelEvent(payload: FunnelEventPayload): void {
  try {
    if (!cachedDeviceInfo) {
      cachedDeviceInfo = getBasicDeviceInfo();
    }

    const event: QueuedEvent = {
      ...payload,
      anonymous_id: null,
      device_type: cachedDeviceInfo.device_type,
      browser: cachedDeviceInfo.browser,
      os: cachedDeviceInfo.os,
      source_app: SOURCE_APP,
      page_url: payload.page_url || (typeof window !== 'undefined' ? window.location.pathname : undefined),
      timestamp: new Date().toISOString(),
    };

    eventQueue.push(event);

    if (!flushTimer) {
      flushTimer = setTimeout(flushEvents, FLUSH_INTERVAL_MS);
    }
  } catch {
    // Silently fail
  }
}

/**
 * Flush all queued events
 */
export async function flushEvents(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (eventQueue.length === 0) return;

  const eventsToSend = [...eventQueue];
  eventQueue = [];

  const body = JSON.stringify({ events: eventsToSend });

  try {
    await fetch('/api/funnel-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  } catch {
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
 * Track and flush immediately
 */
export async function trackFunnelEventImmediate(payload: FunnelEventPayload): Promise<void> {
  trackFunnelEvent(payload);
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
