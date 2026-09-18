'use client';

import { Box, Tooltip, UserAvatar, alpha, useTheme, type SxProps, type Theme } from '@neram/ui';
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
import { languageKeyOf, languageSentence, type LanguageKey } from '@/lib/student-language';
import { DormantIcon, stageIconFor } from './StageGlyph';
import { useStudentStageFacts } from './StudentStageFactsProvider';
import LanguageMark from './LanguageMark';

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
 *   letter      bottom-left, for a student whose language is not English: த
 *               Tamil, ह Hindi, K Kannada, M Malayalam. Outlined instead of
 *               filled when they cannot follow English. A plain English student
 *               keeps a bare corner, and the label says so either way.
 *               Bottom-right stays free for the Teams presence dot.
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

  /**
   * users.home_language. An explicit value wins, INCLUDING null (which reads as
   * English), so a screen that has just reloaded its own payload is never
   * overruled by the session lookup. Leave it undefined to read the lookup by
   * `userId` instead.
   */
  language?: LanguageKey | string | null;
  /** users.limited_english. Read with `language`, and ignored without it. */
  limitedEnglish?: boolean | null;
  /** users.id, used only to look up the language when `language` is not passed. */
  userId?: string | null;

  clickable?: boolean;
  tapToView?: boolean;
  /** Force the corner marks off (glyph and த), e.g. where the adjacent chip already says it. */
  showGlyph?: boolean;
  useGraph?: boolean;
  /**
   * Styles for the avatar INSIDE the ring, merged after the dormant treatment so
   * a caller's colour cannot undo the greyscale. Call sites that already carried
   * their own look (the gold hall-of-fame border, a leaderboard's serif initials)
   * keep it when they adopt the ring, which is what makes adopting it a one-line
   * change rather than a restyle.
   */
  sx?: SxProps<Theme>;
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
  language,
  limitedEnglish,
  userId,
  clickable,
  tapToView,
  showGlyph = true,
  useGraph,
  sx,
}: StudentStageAvatarProps) {
  const theme = useTheme();
  // One context read, no effect. Without a provider (student pages) it is null.
  const { factsFor } = useStudentStageFacts();
  const facts = language === undefined ? factsFor(userId) : null;
  const spoken = language === undefined ? (facts?.language ?? 'english') : languageKeyOf(language);
  const limited = language === undefined ? !!facts?.limitedEnglish : !!limitedEnglish;
  const mode = theme.palette.mode === 'dark' ? 'dark' : 'light';

  const ringColor = dormant ? dormantColor(mode) : stageColor(stage, mode);
  const ringStyle = dormant ? 'dashed' : STAGE_RING_STYLE[stage];

  const label = dormant ? DORMANT_LABEL : STAGE_LABEL[stage];
  // The language sentence goes AFTER "label: tooltip", never before it: the ring's
  // spoken name must keep starting with the stage, which is how tests find rings.
  const sentence = languageSentence(spoken, limited);
  const tooltip = `${dormant ? DORMANT_EXPLAINER : STAGE_TOOLTIP[stage]}${sentence ? ` ${sentence}` : ''}`;

  const withGlyph = showGlyph && size >= MIN_GLYPH_SIZE;
  const Glyph = dormant ? DormantIcon : stageIconFor(stage);

  // Dormant reads as switched off before you have parsed a single word. The
  // caller's own styles come first so the filter always has the last word.
  const avatarSx = {
    ...((sx as object) || {}),
    ...(dormant ? { filter: 'grayscale(1)', opacity: 0.75 } : {}),
  };

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
  // Two px larger floor than the glyph: a letter needs more room than an icon to
  // stay legible on the 30px table avatar.
  const markSize = Math.max(14, Math.round(size * 0.36));

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
        {withGlyph && (
          <LanguageMark
            language={spoken}
            limitedEnglish={limited}
            size={markSize}
            testId="language-badge"
            sx={{
              position: 'absolute',
              bottom: -2,
              left: -2,
              // Separates the mark from the photo and ring it overlaps, in both themes.
              border: `1.5px solid ${theme.palette.background.paper}`,
            }}
          />
        )}
      </Box>
    </Tooltip>
  );
}
