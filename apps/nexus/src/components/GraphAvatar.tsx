'use client';

import { useState, useEffect, useRef } from 'react';
import { Avatar, Badge, type SxProps, type Theme } from '@mui/material';
import { useNexusAuth } from '@/hooks/useNexusAuth';

// Module-level cache for blob URLs to avoid refetching across re-renders
const photoCache = new Map<string, { url: string; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function getCacheKey(msOid: string | undefined, self: boolean | undefined, size: number): string {
  const photoSize = getGraphPhotoSize(size);
  return self ? `self:${photoSize}` : `oid:${msOid}:${photoSize}`;
}

function getGraphPhotoSize(size: number): string {
  if (size <= 48) return '48x48';
  if (size <= 96) return '96x96';
  if (size <= 120) return '120x120';
  if (size <= 240) return '240x240';
  return '648x648';
}

function getInitials(name: string | undefined | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Presence color mapping
const presenceColors: Record<string, string> = {
  Available: '#107c10',
  Busy: '#d13438',
  DoNotDisturb: '#d13438',
  Away: '#eaa300',
  BeRightBack: '#eaa300',
  Offline: '#8a8886',
  PresenceUnknown: '#8a8886',
};

interface GraphAvatarProps {
  msOid?: string | null;
  self?: boolean;
  name?: string | null;
  size?: number;
  sx?: SxProps<Theme>;
  presenceStatus?: string | null;
}

export default function GraphAvatar({
  msOid,
  self,
  name,
  size = 40,
  sx,
  presenceStatus,
}: GraphAvatarProps) {
  const { getToken } = useNexusAuth();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!self && !msOid) {
      setPhotoError(true);
      return;
    }

    const cacheKey = getCacheKey(msOid ?? undefined, self, size);

    // Check cache first
    const cached = photoCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setPhotoUrl(cached.url);
      return;
    }

    let cancelled = false;

    async function fetchPhoto() {
      try {
        const token = await getToken();
        if (!token || cancelled) return;

        const graphSize = getGraphPhotoSize(size);
        const params = new URLSearchParams({ size: graphSize });
        if (self) {
          params.set('self', 'true');
        } else if (msOid) {
          params.set('oid', msOid);
        }

        const response = await fetch(`/api/graph/photo?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok || cancelled) {
          if (!cancelled) setPhotoError(true);
          return;
        }

        const blob = await response.blob();
        if (cancelled) return;

        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;

        // Store in cache
        photoCache.set(cacheKey, { url, timestamp: Date.now() });

        setPhotoUrl(url);
      } catch {
        if (!cancelled) setPhotoError(true);
      }
    }

    fetchPhoto();

    return () => {
      cancelled = true;
    };
  }, [msOid, self, size, getToken]);

  // Cleanup blob URL on unmount (only if not in cache)
  useEffect(() => {
    return () => {
      const url = blobUrlRef.current;
      if (url) {
        // Don't revoke if it's still in cache (other components may use it)
        const inCache = Array.from(photoCache.values()).some((entry) => entry.url === url);
        if (!inCache) {
          URL.revokeObjectURL(url);
        }
      }
    };
  }, []);

  const avatar = (
    <Avatar
      src={!photoError && photoUrl ? photoUrl : undefined}
      sx={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        fontWeight: 700,
        bgcolor: 'primary.main',
        ...((sx as object) || {}),
      }}
    >
      {getInitials(name)}
    </Avatar>
  );

  if (presenceStatus) {
    const color = presenceColors[presenceStatus] || presenceColors.PresenceUnknown;
    return (
      <Badge
        overlap="circular"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        badgeContent={
          <span
            style={{
              width: Math.max(10, size * 0.25),
              height: Math.max(10, size * 0.25),
              borderRadius: '50%',
              backgroundColor: color,
              border: '2px solid white',
              display: 'block',
            }}
          />
        }
      >
        {avatar}
      </Badge>
    );
  }

  return avatar;
}
