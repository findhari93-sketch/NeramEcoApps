'use client';

import { useCallback, useEffect, useState } from 'react';
import ClassSetupGuide, { ClassSetupSkeleton, classSetupIdToken, type ClassSetupData } from '@/components/class-setup/ClassSetupGuide';
import ClassSetupPending, { type ClassSetupPendingData } from '@/components/class-setup/ClassSetupPending';
import ClassSetupNotice from '@/components/class-setup/ClassSetupNotice';

type SetupReply = ClassSetupData | ClassSetupPendingData | { ready: false; pending: null };

async function loadSetup(): Promise<SetupReply | null> {
  try {
    const token = await classSetupIdToken();
    if (!token) return null;
    const res = await fetch('/api/class-setup', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.data as SetupReply) ?? null;
  } catch {
    return null;
  }
}

/**
 * The one student onboarding: the five-step class setup guide, or "almost in"
 * while their payment is checked and their account is made. Every enrolled
 * student gets it, however they enrolled. A failed load offers Try again; it
 * never falls back to anything else.
 */
export default function OnboardingPage() {
  const [reply, setReply] = useState<SetupReply | null | undefined>(undefined);

  const load = useCallback(async () => {
    setReply(await loadSetup());
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSetup().then((data) => {
      if (!cancelled) setReply(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshGuide = useCallback(async (): Promise<ClassSetupData | null> => {
    const data = await loadSetup();
    return data?.ready ? data : null;
  }, []);

  const refreshPending = useCallback(async (): Promise<'ready' | ClassSetupPendingData | null> => {
    const data = await loadSetup();
    if (data?.ready) {
      setReply(data);
      return 'ready';
    }
    return data?.pending ? (data as ClassSetupPendingData) : null;
  }, []);

  if (reply === undefined) return <ClassSetupSkeleton />;
  if (reply === null) return <ClassSetupNotice kind="error" onRetry={load} />;
  if (reply.ready) return <ClassSetupGuide initial={reply} onRefresh={refreshGuide} />;
  if (reply.pending) return <ClassSetupPending initial={reply as ClassSetupPendingData} onRefresh={refreshPending} />;
  return <ClassSetupNotice kind="not-enrolled" />;
}
