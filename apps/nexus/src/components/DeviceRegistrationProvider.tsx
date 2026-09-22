'use client';

import { createContext, useContext } from 'react';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useDeviceRegistration } from '@/hooks/useDeviceRegistration';
import { useActiveTimeTracker } from '@/hooks/useActiveTimeTracker';
import DeviceLimitBanner from './DeviceLimitBanner';

interface DeviceRegistrationState {
  deviceId: string | null;
  limitReached: boolean;
  limitCategory: string | null;
  loading: boolean;
}

const DeviceRegistrationContext = createContext<DeviceRegistrationState>({
  deviceId: null,
  limitReached: false,
  limitCategory: null,
  loading: true,
});

export function useDeviceRegistrationContext() {
  return useContext(DeviceRegistrationContext);
}

export default function DeviceRegistrationProvider({ children }: { children: React.ReactNode }) {
  // Silent: registration and the heartbeat run in the background, and the
  // redirecting getToken would send the page to Microsoft sign-in under the
  // student when the session expires (PERF-0054).
  const { getTokenSilently: getToken, isStudent, loading: authLoading, user, impersonation } = useNexusAuthContext();
  // A teacher viewing as a student is not that student at their own device.
  // getToken hands out the impersonation token then, which the server resolves as
  // the student, so registering or tracking here would take the student's device
  // slot and log the teacher's time as theirs (PERF-0035).
  const ownStudentSession = isStudent && !impersonation.active;

  const { deviceId, limitReached, limitCategory, loading } = useDeviceRegistration(
    getToken,
    ownStudentSession,
    !authLoading,
    user?.id ?? null
  );

  // Track active time when device is registered
  useActiveTimeTracker({
    deviceId,
    getToken,
    enabled: !!deviceId && ownStudentSession,
  });

  return (
    <DeviceRegistrationContext.Provider value={{ deviceId, limitReached, limitCategory, loading }}>
      {limitReached && <DeviceLimitBanner limitCategory={limitCategory} />}
      {children}
    </DeviceRegistrationContext.Provider>
  );
}
