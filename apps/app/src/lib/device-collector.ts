/**
 * Client-side device info and location collector
 * Collects device metadata, precise location, and network info
 */

export interface DeviceInfo {
  device_type: string;
  browser: string;
  browser_version: string;
  os: string;
  os_version: string;
  user_agent: string;
  screen_width: number;
  screen_height: number;
  device_pixel_ratio: number;
  timezone: string;
  language: string;
  connection_type: string | null;
  effective_bandwidth: number | null;
  is_pwa: boolean;
}

export interface LocationInfo {
  latitude: number;
  longitude: number;
  location_accuracy: number;
}

function getBrowserInfo(): { name: string; version: string } {
  const ua = navigator.userAgent;

  if (ua.includes('Chrome') && !ua.includes('Edg')) {
    const match = ua.match(/Chrome\/(\d+[\.\d]*)/);
    return { name: 'Chrome', version: match?.[1] || '' };
  }
  if (ua.includes('Safari') && !ua.includes('Chrome')) {
    const match = ua.match(/Version\/(\d+[\.\d]*)/);
    return { name: 'Safari', version: match?.[1] || '' };
  }
  if (ua.includes('Firefox')) {
    const match = ua.match(/Firefox\/(\d+[\.\d]*)/);
    return { name: 'Firefox', version: match?.[1] || '' };
  }
  if (ua.includes('Edg')) {
    const match = ua.match(/Edg\/(\d+[\.\d]*)/);
    return { name: 'Edge', version: match?.[1] || '' };
  }
  return { name: 'Unknown', version: '' };
}

function getOSInfo(): { name: string; version: string } {
  const ua = navigator.userAgent;

  if (ua.includes('Android')) {
    const match = ua.match(/Android\s(\d+[\.\d]*)/);
    return { name: 'Android', version: match?.[1] || '' };
  }
  if (ua.includes('iPhone') || ua.includes('iPad')) {
    const match = ua.match(/OS\s(\d+[_\d]*)/);
    return { name: 'iOS', version: match?.[1]?.replace(/_/g, '.') || '' };
  }
  if (ua.includes('Windows')) {
    const match = ua.match(/Windows NT\s(\d+[\.\d]*)/);
    return { name: 'Windows', version: match?.[1] || '' };
  }
  if (ua.includes('Mac OS X')) {
    const match = ua.match(/Mac OS X\s(\d+[_\d]*)/);
    return { name: 'macOS', version: match?.[1]?.replace(/_/g, '.') || '' };
  }
  if (ua.includes('Linux')) {
    return { name: 'Linux', version: '' };
  }
  return { name: 'Unknown', version: '' };
}

function getDeviceType(): string {
  const ua = navigator.userAgent;
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android.*mobile|windows phone/i.test(ua)) return 'mobile';
  return 'desktop';
}

export function collectDeviceInfo(): DeviceInfo {
  const browser = getBrowserInfo();
  const os = getOSInfo();
  const connection = (navigator as Record<string, unknown>).connection as Record<string, unknown> | undefined;

  return {
    device_type: getDeviceType(),
    browser: browser.name,
    browser_version: browser.version,
    os: os.name,
    os_version: os.version,
    user_agent: navigator.userAgent,
    screen_width: window.screen.width,
    screen_height: window.screen.height,
    device_pixel_ratio: window.devicePixelRatio || 1,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    connection_type: (connection?.effectiveType as string) || null,
    effective_bandwidth: (connection?.downlink as number) || null,
    is_pwa: window.matchMedia('(display-mode: standalone)').matches,
  };
}

export function collectLocation(): Promise<LocationInfo | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          location_accuracy: position.coords.accuracy,
        });
      },
      () => {
        // User denied or error — return null silently
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000, // Cache for 5 minutes
      }
    );
  });
}
