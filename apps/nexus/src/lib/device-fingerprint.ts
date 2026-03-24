/**
 * Device Fingerprinting Utility
 *
 * Generates a stable fingerprint from device attributes to uniquely identify
 * a student's device. Uses only stable attributes that don't change with
 * browser updates.
 *
 * The fingerprint is stored in localStorage for consistency across sessions.
 */

const FINGERPRINT_KEY = 'neram_device_fingerprint';

/**
 * Generate a hash from a string using the Web Crypto API
 */
async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Collect stable device attributes for fingerprinting
 */
function getStableAttributes(): string {
  const parts: string[] = [];

  // Screen dimensions (stable per device)
  parts.push(`${window.screen.width}x${window.screen.height}`);
  parts.push(`dpr:${window.devicePixelRatio || 1}`);

  // OS detection (stable)
  const ua = navigator.userAgent;
  if (ua.includes('Android')) parts.push('os:android');
  else if (ua.includes('iPhone') || ua.includes('iPad')) parts.push('os:ios');
  else if (ua.includes('Windows')) parts.push('os:windows');
  else if (ua.includes('Mac OS X')) parts.push('os:macos');
  else if (ua.includes('Linux')) parts.push('os:linux');
  else parts.push('os:unknown');

  // Timezone (generally stable per device)
  parts.push(`tz:${Intl.DateTimeFormat().resolvedOptions().timeZone}`);

  // Language (generally stable)
  parts.push(`lang:${navigator.language}`);

  // Hardware concurrency (CPU cores - stable per device)
  if (navigator.hardwareConcurrency) {
    parts.push(`cores:${navigator.hardwareConcurrency}`);
  }

  // Device memory (Chrome only, stable per device)
  const nav = navigator as unknown as Record<string, unknown>;
  if (nav.deviceMemory) {
    parts.push(`mem:${nav.deviceMemory}`);
  }

  // Max touch points (distinguishes touch vs non-touch)
  parts.push(`touch:${navigator.maxTouchPoints || 0}`);

  // Color depth
  parts.push(`color:${window.screen.colorDepth}`);

  // PWA mode
  const isPWA = window.matchMedia('(display-mode: standalone)').matches;
  parts.push(`pwa:${isPWA}`);

  return parts.join('|');
}

/**
 * Get the device category based on device characteristics
 */
export function getDeviceCategory(): 'desktop' | 'mobile' {
  const ua = navigator.userAgent;
  if (/mobile|iphone|ipod|android.*mobile|windows phone/i.test(ua)) return 'mobile';
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'mobile'; // Tablets count as mobile
  return 'desktop';
}

/**
 * Generate a human-readable device name
 */
export function getDeviceName(): string {
  const ua = navigator.userAgent;
  let browser = 'Browser';
  let os = 'Device';

  // Detect browser
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Edge';

  // Detect OS
  if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone')) os = 'iPhone';
  else if (ua.includes('iPad')) os = 'iPad';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';

  return `${browser} on ${os}`;
}

/**
 * Get or generate the device fingerprint
 * Cached in localStorage for stability across sessions
 */
export async function getDeviceFingerprint(): Promise<string> {
  // Check localStorage first
  const cached = localStorage.getItem(FINGERPRINT_KEY);
  if (cached) return cached;

  // Generate new fingerprint
  const attributes = getStableAttributes();
  const fingerprint = await hashString(attributes);

  // Cache it
  localStorage.setItem(FINGERPRINT_KEY, fingerprint);
  return fingerprint;
}

/**
 * Clear the cached fingerprint (used when deregistering)
 */
export function clearDeviceFingerprint(): void {
  localStorage.removeItem(FINGERPRINT_KEY);
}
