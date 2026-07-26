'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Avatar,
  Badge,
  ImageViewerDialog,
  getAvatarColor,
  getAvatarInitials,
  usePhotoViewerGesture,
  type SxProps,
  type Theme,
} from '@neram/ui';
import { useNexusAuth } from '@/hooks/useNexusAuth';

// Module-level cache for blob URLs to avoid refetching across re-renders
const NO_PHOTO = '__NO_PHOTO__';
const photoCache = new Map<string, { url: string; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function getCacheKey(
  msOid: string | undefined,
  self: boolean | undefined,
  size: number,
  selfIdentity: string
): string {
  const photoSize = getGraphPhotoSize(size);
  return self ? `self:${selfIdentity}:${photoSize}` : `oid:${msOid}:${photoSize}`;
}

function getGraphPhotoSize(size: number): string {
  if (size <= 48) return '48x48';
  if (size <= 96) return '96x96';
  if (size <= 120) return '120x120';
  if (size <= 240) return '240x240';
  return '648x648';
}

/** Highest resolution Graph serves, used for the enlarged viewer. */
const HI_RES_SIZE = '648x648';

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
  /** Allow opening the enlarged view (via any gesture) when a photo is loaded. Default true. */
  clickable?: boolean;
  /** Does a plain tap open the viewer? Set false when the avatar has a primary action. Default true. */
  tapToView?: boolean;
  /**
   * The Nexus-stored `users.avatar_url`, shown whenever the live Microsoft
   * Graph photo isn't available yet (still loading, 404, or Graph error).
   *
   * A photo only reaches Microsoft after a teacher approves it (see
   * lib/photo-ms-sync.ts), so for the whole pending window `self` fetches
   * would 404 and this component fell back to blank initials, making an
   * uploaded-but-unreviewed photo look like it was never uploaded. Passing
   * this closes that gap: the student's own photo, wherever it currently
   * lives, is always what they see of themselves.
   */
  fallbackSrc?: string | null;
}

export default function GraphAvatar({
  msOid,
  self,
  name,
  size = 40,
  sx,
  presenceStatus,
  clickable = true,
  tapToView = true,
  fallbackSrc,
}: GraphAvatarProps) {
  const { getToken, impersonation } = useNexusAuth();
  // Discriminates *who* "self" currently resolves to, so the photo cache
  // (keyed below) doesn't serve the real admin's photo while impersonating a
  // student, or vice versa after exiting. See GraphAvatar cache-key note.
  const selfIdentity = impersonation.active
    ? `imp:${impersonation.student?.id ?? 'unknown'}`
    : 'real';
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [largeUrl, setLargeUrl] = useState<string | null>(null);
  const [largeError, setLargeError] = useState(false);
  const blobUrlRef = useRef<string | null>(null);
  const largeBlobRef = useRef<string | null>(null);

  useEffect(() => {
    // Reset local state up front: when selfIdentity changes (impersonation
    // start/exit) we must not keep showing the previous identity's photo
    // while the new one is being fetched (or served from a cache hit).
    setPhotoUrl(null);
    setPhotoError(false);
    setLargeUrl(null);
    setLargeError(false);

    if (!self && !msOid) {
      setPhotoError(true);
      return;
    }

    const cacheKey = getCacheKey(msOid ?? undefined, self, size, selfIdentity);

    // Check cache first (includes cached 404s)
    const cached = photoCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      if (cached.url === NO_PHOTO) {
        setPhotoError(true);
        return;
      }
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
          if (!cancelled) {
            // Cache 404s to avoid repeated requests for users without photos
            if (response.status === 404) {
              photoCache.set(cacheKey, { url: NO_PHOTO, timestamp: Date.now() });
            }
            setPhotoError(true);
          }
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
  }, [msOid, self, size, getToken, selfIdentity]);

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
      const large = largeBlobRef.current;
      if (large) URL.revokeObjectURL(large);
    };
  }, []);

  const initials = getAvatarInitials(name);
  const initialsCount = initials.length;
  // Prefer the live Microsoft photo once it has actually loaded; otherwise (still
  // loading, 404, or a fetch error) fall back to the Nexus-stored photo rather
  // than blank initials. Never regress a real photo back to initials.
  const shownPhoto = !photoError && photoUrl ? photoUrl : fallbackSrc || null;
  const canOpen = clickable && !!shownPhoto;

  const { open: viewerOpen, setOpen: setViewerOpen, handlers } = usePhotoViewerGesture({
    canOpen,
    tapToView,
  });

  // The little avatar only loads a small thumbnail. When the viewer opens, fetch
  // the full-resolution photo once (on demand, so no per-render cost) and swap it
  // into the dialog.
  const needsHiRes = getGraphPhotoSize(size) !== HI_RES_SIZE;
  useEffect(() => {
    if (!viewerOpen || !needsHiRes) return;
    if (largeUrl || largeError) return;
    if (!self && !msOid) return;

    let cancelled = false;

    async function fetchLarge() {
      try {
        const token = await getToken();
        if (!token || cancelled) return;

        const params = new URLSearchParams({ size: HI_RES_SIZE });
        if (self) {
          params.set('self', 'true');
        } else if (msOid) {
          params.set('oid', msOid);
        }

        const response = await fetch(`/api/graph/photo?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok || cancelled) {
          if (!cancelled) setLargeError(true);
          return;
        }

        const blob = await response.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        largeBlobRef.current = url;
        setLargeUrl(url);
      } catch {
        if (!cancelled) setLargeError(true);
      }
    }

    fetchLarge();

    return () => {
      cancelled = true;
    };
  }, [viewerOpen, needsHiRes, largeUrl, largeError, self, msOid, getToken, selfIdentity]);

  const avatar = (
    <Avatar
      src={shownPhoto || undefined}
      {...(canOpen ? handlers : {})}
      sx={{
        width: size,
        height: size,
        fontSize: initialsCount > 1 ? size * 0.36 : size * 0.44,
        fontWeight: 700,
        bgcolor: getAvatarColor(name),
        color: '#fff',
        letterSpacing: initialsCount > 1 ? '-0.5px' : 0,
        cursor: canOpen ? 'pointer' : undefined,
        ...(canOpen
          ? { touchAction: 'manipulation', userSelect: 'none', WebkitTouchCallout: 'none' }
          : {}),
        ...((sx as object) || {}),
      }}
    >
      {initials}
    </Avatar>
  );

  const viewer = canOpen ? (
    <ImageViewerDialog
      open={viewerOpen}
      onClose={() => setViewerOpen(false)}
      src={largeUrl || shownPhoto || ''}
      name={name}
    />
  ) : null;

  if (presenceStatus) {
    const color = presenceColors[presenceStatus] || presenceColors.PresenceUnknown;
    return (
      <>
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
        {viewer}
      </>
    );
  }

  return (
    <>
      {avatar}
      {viewer}
    </>
  );
}
