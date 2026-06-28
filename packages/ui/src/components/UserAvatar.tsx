'use client';

/**
 * UserAvatar
 *
 * Drop-in replacement for a person's <Avatar>. Shows the photo from `src`
 * (a public avatar_url, populated from Microsoft Graph or a user upload) and
 * falls back to deterministic initials + color.
 *
 * Interaction (see usePhotoViewerGesture):
 * - Long-press (touch) / right-click (desktop) always opens the enlarged view.
 * - A plain tap opens it too, unless `tapToView={false}` (use that when the
 *   avatar sits inside something that already handles tap, e.g. a menu trigger
 *   or a clickable row, so the tap reaches that action instead).
 *
 * Display reads straight from `src`, so there are no per-render network calls.
 */

import Avatar from '@mui/material/Avatar';
import type { SxProps, Theme } from '@mui/material/styles';
import { getAvatarColor, getAvatarInitials } from '../utils';
import { usePhotoViewerGesture } from '../hooks/usePhotoViewerGesture';
import { ImageViewerDialog } from './ImageViewerDialog';

export interface UserAvatarProps {
  /** Public image URL (avatar_url). When absent, shows initials. */
  src?: string | null;
  /** Person's name, used for initials + fallback color and the viewer caption. */
  name?: string | null;
  /** Pixel size of the avatar (width = height). Default 40. */
  size?: number;
  /** Extra MUI styles merged onto the Avatar. */
  sx?: SxProps<Theme>;
  /** Allow opening the enlarged view (via any gesture) when a photo exists. Default true. */
  clickable?: boolean;
  /** Does a plain tap open the viewer? Set false when the avatar has a primary action. Default true. */
  tapToView?: boolean;
  /** Optional larger image for the viewer; defaults to `src`. */
  largeSrc?: string | null;
}

export function UserAvatar({
  src,
  name,
  size = 40,
  sx,
  clickable = true,
  tapToView = true,
  largeSrc,
}: UserAvatarProps): JSX.Element {
  const initials = getAvatarInitials(name);
  const initialsCount = initials.length;
  const hasPhoto = !!src;
  const canOpen = clickable && hasPhoto;

  const { open, setOpen, handlers } = usePhotoViewerGesture({ canOpen, tapToView });

  return (
    <>
      <Avatar
        src={src || undefined}
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
            ? {
                touchAction: 'manipulation',
                userSelect: 'none',
                WebkitTouchCallout: 'none',
              }
            : {}),
          ...((sx as object) || {}),
        }}
      >
        {initials}
      </Avatar>

      {canOpen && (
        <ImageViewerDialog
          open={open}
          onClose={() => setOpen(false)}
          src={largeSrc || src || ''}
          name={name}
        />
      )}
    </>
  );
}

export default UserAvatar;
