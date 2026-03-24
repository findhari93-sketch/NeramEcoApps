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
  const { getToken, isStudent, loading: authLoading } = useNexusAuthContext();

  const { deviceId, limitReached, limitCategory, loading } = useDeviceRegistration(
    getToken,
    isStudent,
    !authLoading
  );

  // Track active time when device is registered
  useActiveTimeTracker({
    deviceId,
    getToken,
    enabled: !!deviceId && isStudent,
  });

  return (
    <DeviceRegistrationContext.Provider value={{ deviceId, limitReached, limitCategory, loading }}>
      {limitReached && <DeviceLimitBanner limitCategory={limitCategory} />}
      {children}
    </DeviceRegistrationContext.Provider>
  );
}
