'use client';

import { useState, useEffect } from 'react';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

export interface GraphProfile {
  displayName: string | null;
  givenName: string | null;
  surname: string | null;
  jobTitle: string | null;
  department: string | null;
  officeLocation: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  mobilePhone: string | null;
  businessPhones: string[];
  employeeId: string | null;
  mail: string | null;
  userPrincipalName: string | null;
}

// Module-level cache with 5-minute TTL
const profileCache = new Map<string, { data: GraphProfile; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

function getCacheKey(msOid: string | undefined, self: boolean | undefined): string {
  return self ? 'self' : `oid:${msOid}`;
}

export function useGraphProfile(msOid?: string | null, self?: boolean) {
  const { getToken } = useNexusAuthContext();
  const [profile, setProfile] = useState<GraphProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!self && !msOid) return;

    const cacheKey = getCacheKey(msOid ?? undefined, self);
    const cached = profileCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setProfile(cached.data);
      return;
    }

    let cancelled = false;

    async function fetchProfile() {
      setLoading(true);
      setError(null);

      try {
        const token = await getToken();
        if (!token || cancelled) return;

        const params = new URLSearchParams();
        if (self) {
          params.set('self', 'true');
        } else if (msOid) {
          params.set('oid', msOid);
        }

        const res = await fetch(`/api/graph/profile?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok || cancelled) {
          if (!cancelled) setError('Failed to load profile');
          return;
        }

        const data: GraphProfile = await res.json();
        if (cancelled) return;

        profileCache.set(cacheKey, { data, timestamp: Date.now() });
        setProfile(data);
      } catch {
        if (!cancelled) setError('Failed to load profile');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchProfile();

    return () => {
      cancelled = true;
    };
  }, [msOid, self, getToken]);

  return { profile, loading, error };
}
