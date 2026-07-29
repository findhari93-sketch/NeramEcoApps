'use client';

import { Box, Tooltip, UserAvatar, alpha, useTheme } from '@neram/ui';
import GraphAvatar from '@/components/GraphAvatar';
import {
  DORMANT_EXPLAINER,
  DORMANT_LABEL,
  STAGE_LABEL,
  STAGE_RING_STYLE,
  STAGE_TOOLTIP,
  dormantColor,
  stageColor,
  type StageKey,
} from '@/lib/student-stage';
import { DormantIcon, stageIconFor } from './StageGlyph';

/**
 * A student avatar that carries their classification.
 *
 * This is the piece that makes the category readable on the roughly thirty
 * screens that show nothing but a photo and a name: an attendance sheet, a
 * submission review, a leaderboard row. A chip needs horizontal space and a
 * label; a ring needs neither and travels with the face.
 *
 *   ring        the study stage. Solid for a recorded stage, DOTTED for "not
 *               set", DASHED for dormant. Dotted versus dashed is what keeps
 *               "nobody has told us" distinguishable from "they have paused",
 *               which are two greys that would otherwise read identically.
 *   greyscale   dormant only. Reads as "switched off" before you have processed
 *               anything else on the row.
 *   glyph       a small icon at top-right. Colour is never the only signal.
 *
 * It WRAPS GraphAvatar and UserAvatar rather than modifying either, so all their
 * existing call sites keep working untouched and adopting this is a one-line
 * swap per site. Both spread `sx` last, which is what lets the greyscale filter
 * compose without either component knowing about it.
 *
 * Pick ONE identity source: pass `msOid` for the live Microsoft Graph photo
 * (teacher-facing lists), or `src` for the stored avatar_url.
 */

/** Below this the glyph is an unreadable smudge, so drop it and keep the ring. */
const MIN_GLYPH_SIZE = 28;

export interface StudentStageAvatarProps {
  stage: StageKey;
  dormant?: boolean;
  size?: number;
  name?: string | null;

  /** Present (even as null) selects the Graph path. */
  msOid?: string | null;
  fallbackSrc?: string | null;
  presenceStatus?: string | null;

  /** Selects the stored-avatar path. */
  src?: string | null;
  largeSrc?: string | null;

  clickable?: boolean;
  tapToView?: boolean;
  /** Force the glyph off, e.g. where the adjacent chip already says it. */
  showGlyph?: boolean;
  useGraph?: boolean;
}

export default function StudentStageAvatar({
  stage,
  dormant = false,
  size = 40,
  name,
  msOid,
  fallbackSrc,
  presenceStatus,
  src,
  largeSrc,
  clickable,
  tapToView,
  showGlyph = true,
  useGraph,
}: StudentStageAvatarProps) {
  const theme = useTheme();
  const mode = theme.palette.mode === 'dark' ? 'dark' : 'light';

  const ringColor = dormant ? dormantColor(mode) : stageColor(stage, mode);
  const ringStyle = dormant ? 'dashed' : STAGE_RING_STYLE[stage];

  const label = dormant ? DORMANT_LABEL : STAGE_LABEL[stage];
  const tooltip = dormant ? DORMANT_EXPLAINER : STAGE_TOOLTIP[stage];

  const withGlyph = showGlyph && size >= MIN_GLYPH_SIZE;
  const Glyph = dormant ? DormantIcon : stageIconFor(stage);

  // Dormant reads as switched off before you have parsed a single word.
  const avatarSx = dormant ? { filter: 'grayscale(1)', opacity: 0.75 } : undefined;

  const graph = useGraph ?? msOid !== undefined;

  const avatar = graph ? (
    <GraphAvatar
      msOid={msOid}
      name={name}
      size={size}
      sx={avatarSx}
      presenceStatus={presenceStatus}
      clickable={clickable}
      tapToView={tapToView}
      fallbackSrc={fallbackSrc ?? src}
    />
  ) : (
    <UserAvatar
      src={src}
      largeSrc={largeSrc}
      name={name}
      size={size}
      sx={avatarSx}
      clickable={clickable}
      tapToView={tapToView}
    />
  );

  const glyphSize = Math.max(12, Math.round(size * 0.36));

  return (
    <Tooltip title={`${label}. ${tooltip}`} arrow enterTouchDelay={0} leaveTouchDelay={4000}>
      <Box
        aria-label={`${label}: ${tooltip}`}
        sx={{
          position: 'relative',
          flexShrink: 0,
          width: size + 8,
          height: size + 8,
          display: 'grid',
          placeItems: 'center',
          borderRadius: '50%',
          border: `2px ${ringStyle} ${ringColor}`,
          // A faint wash inside the ring so the state survives on a photo whose
          // edge happens to sit near the ring colour.
          bgcolor: alpha(ringColor, 0.08),
        }}
      >
        {avatar}
        {withGlyph && (
          <Box
            sx={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: glyphSize,
              height: glyphSize,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              bgcolor: ringColor,
              // Separates the glyph from whatever it overlaps, in both themes.
              border: `1.5px solid ${theme.palette.background.paper}`,
            }}
          >
            <Glyph
              sx={{
                fontSize: glyphSize * 0.68,
                color: mode === 'dark' ? '#0B1220' : '#FFFFFF',
              }}
            />
          </Box>
        )}
      </Box>
    </Tooltip>
  );
}
