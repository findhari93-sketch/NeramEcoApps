'use client';

import { useEffect, useState } from 'react';
import { getDeviceFingerprint, getDeviceCategory, getDeviceName } from '@/lib/device-fingerprint';
import { collectDeviceInfo } from '@/lib/device-collector';

/**
 * This tab's registered device, remembered per account.
 *
 * It used to be one bare id, so after a sign-out and a different student's
 * sign-in in the same tab, the second student's time was logged against the
 * first student's device (PERF-0035). The value is now `<user id>:<device id>`,
 * and a value left by another account, or by the old format, reads as nothing.
 * DeviceSection removes this key when the current device is deregistered.
 */
const REGISTERED_DEVICE_KEY = 'neram_device_registered';

function readRegisteredDevice(userId: string): string | null {
  const value = sessionStorage.getItem(REGISTERED_DEVICE_KEY);
  const prefix = `${userId}:`;
  return value?.startsWith(prefix) ? value.slice(prefix.length) || null : null;
}

function rememberRegisteredDevice(userId: string, deviceId: string): void {
  sessionStorage.setItem(REGISTERED_DEVICE_KEY, `${userId}:${deviceId}`);
}

interface DeviceRegistrationResult {
  deviceId: string | null;
  isNewDevice: boolean;
  limitReached: boolean;
  limitCategory: string | null;
  loading: boolean;
}

/**
 * Automatically registers the current device on login (Nexus/Microsoft auth).
 * Returns the device ID for heartbeat tracking.
 * Only activates for student users, and never while a teacher views as a student:
 * the caller passes isStudent false then.
 */
export function useDeviceRegistration(
  getToken: () => Promise<string | null>,
  isStudent: boolean,
  enabled = true,
  userId: string | null = null
): DeviceRegistrationResult {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isNewDevice, setIsNewDevice] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [limitCategory, setLimitCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isStudent || !enabled || !userId) {
      setLoading(false);
      return;
    }

    // Captured for register() below: a nested function does not keep the narrowing.
    const ownerId = userId;
    const registered = readRegisteredDevice(ownerId);
    if (registered) {
      setDeviceId(registered);
      setLoading(false);
      return;
    }

    async function register() {
      try {
        const token = await getToken();
        if (!token) {
          setLoading(false);
          return;
        }

        const fingerprint = await getDeviceFingerprint();
        const category = getDeviceCategory();
        const deviceName = getDeviceName();
        const deviceInfo = collectDeviceInfo();

        const response = await fetch('/api/devices/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
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
            rememberRegisteredDevice(ownerId, device.id);
            setIsNewDevice(true);
          }
        } else if (response.status === 409) {
          // Device limit reached for this category
          const { error } = await response.json();
          setLimitReached(true);
          setLimitCategory(category);
          console.warn('Device limit reached:', error);
        }
      } catch {
        // Registration failure should not break the app
      } finally {
        setLoading(false);
      }
    }

    register();
  }, [getToken, isStudent, enabled, userId]);

  return { deviceId, isNewDevice, limitReached, limitCategory, loading };
}
