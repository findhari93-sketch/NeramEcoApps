'use client';

import { useEffect, useState } from 'react';
import { getDeviceFingerprint, getDeviceCategory, getDeviceName } from '@/lib/device-fingerprint';
import { collectDeviceInfo } from '@/lib/device-collector';

interface DeviceRegistrationResult {
  deviceId: string | null;
  isNewDevice: boolean;
  loading: boolean;
}

/**
 * Automatically registers the current device on login.
 * Returns the device ID for heartbeat tracking.
 * No device limit enforced — tools app allows unlimited devices.
 */
export function useDeviceRegistration(
  idToken: string | null,
  enabled = true
): DeviceRegistrationResult {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isNewDevice, setIsNewDevice] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!idToken || !enabled) {
      setLoading(false);
      return;
    }

    const registered = sessionStorage.getItem('neram_device_registered');
    if (registered) {
      setDeviceId(registered);
      setLoading(false);
      return;
    }

    async function register() {
      try {
        const fingerprint = await getDeviceFingerprint();
        const category = getDeviceCategory();
        const deviceName = getDeviceName();
        const deviceInfo = collectDeviceInfo();

        const response = await fetch('/api/devices/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idToken,
            fingerprint,
            deviceCategory: category,
            deviceName,
            deviceType: deviceInfo.device_type,
            browser: deviceInfo.browser,
            os: deviceInfo.os,
            osVersion: deviceInfo.os_version,
            screenWidth: deviceInfo.screen_width,
            screenHeight: deviceInfo.screen_height,
            isPwa: deviceInfo.is_pwa,
          }),
        });

        if (response.ok) {
          const { device } = await response.json();
          if (device) {
            setDeviceId(device.id);
            sessionStorage.setItem('neram_device_registered', device.id);
            setIsNewDevice(true);
          }
        }
      } catch {
        // Registration failure should not break the app
      } finally {
        setLoading(false);
      }
    }

    register();
  }, [idToken, enabled]);

  return { deviceId, isNewDevice, loading };
}
