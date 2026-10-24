'use client';

/**
 * PersonAvatar: the one avatar for a person anywhere in Admin.
 *
 *   ring    who they are to Neram (gold student, dashed gold paused, silver
 *           alumni, slate lead, blue staff, dotted slate for parents, guests
 *           and outside reviewers). Every person wears one; only a person whose
 *           facts are still loading is bare. lib/person-avatar.ts holds the
 *           rules, AvatarKey.tsx teaches them.
 *   corners the same map as Nexus, so staff learn it once:
 *             bottom-left   language: black disc recorded, outlined limited
 *                           English, grey a guess
 *             top-right     exam year, "27" for the 2027 exam (funnel only)
 *             top-left      flame for a hot lead
 *             bottom-right  green dot: active this week
 *   hover   PersonGlanceCard: name, role, class and exam, language, place,
 *           classroom, CRM stage, last active, follow-up interest.
 *
 * Facts come from three places, and an explicit prop always wins:
 *   1. `facts` passed by a screen that already has them on its rows (CRM)
 *   2. the PersonFactsProvider, asked by `userId`, batched with the rest of the screen
 *   3. `place` (city, state, site language) for a demo request with no account
 *
 * Until facts arrive the avatar sits at its final size with no ring, and the ring
 * fades in, so a list never jumps.
 *
 * The words go in the hover card and the aria-label, so a colour or a corner
 * mark is never the only way to know.
 */
import type { SxProps, Theme } from '@neram/ui';
import { AvatarRing, Box, LanguageMark, Tooltip, UserAvatar, type AvatarRingVariant } from '@neram/ui';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import {
  avatarLanguageOf,
  examYearMark,
  glanceSentences,
  isActiveRecently,
  isHotLead,
  personAvatarLabel,
  resolvePersonRing,
  showsGlanceMarks,
  type PersonFacts,
} from '@/lib/person-avatar';
import { usePersonFacts, type PersonPlace } from './PersonFactsProvider';
import PersonGlanceCard from './PersonGlanceCard';

/** Below this the corner marks are unreadable and crowd the face, so they are left off (as in Nexus). */
export const MIN_MARK_AVATAR_SIZE = 28;
/** Two digits need a little more room than one letter. */
export const MIN_EXAM_AVATAR_SIZE = 32;
/** Deep orange for a hot lead: white flame on it is 5.2:1. */
const HOT_COLOR = '#C2410C';

export interface PersonAvatarProps {
  /** users.id. Lets the avatar look up its own ring and language. */
  userId?: string | null;
  name?: string | null;
  src?: string | null;
  /** The photo's size; the ring adds 6px around it. Default 40. */
  size?: number;
  /** Facts the screen already holds. Each defined field beats the looked-up one. */
  facts?: Partial<PersonFacts>;
  /** Where a person with no account lives, for the language guess. */
  place?: PersonPlace | null;
  /** Force a ring, e.g. 'staff' for a note author, 'other' for a Google reviewer. */
  ring?: AvatarRingVariant;
  /** The word for this person when the ring's own is too general: "Google reviewer", "Chat guest". */
  ringLabel?: string;
  /** Leave the language mark off (a screen that shows language in words already). */
  hideLanguage?: boolean;
  /** Off where the avatar already sits inside a tooltip of its own (a button, a chip). */
  tooltip?: boolean;
  /** Plain tap opens the photo. Off by default: avatars here sit in clickable rows. */
  tapToView?: boolean;
  sx?: SxProps<Theme>;
}

function definedOnly<T extends object>(obj: T | undefined): Partial<T> {
  if (!obj) return {};
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export default function PersonAvatar({
  userId,
  name,
  src,
  size = 40,
  facts,
  place,
  ring,
  ringLabel,
  hideLanguage = false,
  tooltip = true,
  tapToView = false,
  sx,
}: PersonAvatarProps) {
  // The place is asked for even with a userId: a person whose own profile names
  // no state or city can still be placed by, say, the city on their demo request.
  const { facts: looked, placeGuess } = usePersonFacts(userId, place);

  const given = definedOnly(facts);
  const known = !!looked || Object.keys(given).length > 0;
  const merged: Partial<PersonFacts> = { ...(looked ?? {}), ...given };
  if (merged.guess == null && placeGuess) merged.guess = placeGuess;

  // No account at all means a prospect: a lead from the first paint.
  const variant: AvatarRingVariant = ring ?? (known ? resolvePersonRing(merged) : userId ? 'none' : 'lead');
  const language = hideLanguage ? null : avatarLanguageOf(merged);
  const displayName = name ?? merged.name ?? null;
  const photo = src !== undefined ? src : merged.avatarUrl ?? null;
  const role = ringLabel ?? (merged.userType === 'parent' ? 'Parent' : undefined);
  const glance = glanceSentences(merged, variant);
  const label = [personAvatarLabel(displayName, variant, language, role), ...glance.map((g) => `${g}.`)].join(' ');

  // The corners, as in Nexus: language bottom-left, then the Admin glance marks.
  const roomy = size >= MIN_MARK_AVATAR_SIZE;
  // A touch larger than Nexus's 0.36: Admin avatars run 32 to 40px and the
  // letter has to read at a glance across a dense table.
  const markSize = Math.max(16, Math.round(size * 0.4));
  const funnel = showsGlanceMarks(variant);
  const showLanguage = !!language && roomy;
  const exam = funnel && size >= MIN_EXAM_AVATAR_SIZE ? examYearMark(merged.examYear) : null;
  const hot = roomy && isHotLead(merged, variant);
  const active = roomy && funnel && isActiveRecently(merged);
  const dot = Math.max(8, Math.round(size * 0.22));
  // Separates every corner mark from the photo and ring it overlaps, in both themes.
  const edge = (theme: Theme) => `1.5px solid ${theme.palette.background.paper}`;

  const avatar = (
    <Box
      role="img"
      aria-label={label}
      data-testid="person-avatar"
      sx={[{ display: 'inline-flex', flexShrink: 0, lineHeight: 0 }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      <AvatarRing variant={variant} size={size}>
        <UserAvatar src={photo} name={displayName} size={size} tapToView={tapToView} />
        {showLanguage && (
          <LanguageMark
            language={language.key}
            limitedEnglish={language.limitedEnglish}
            likely={language.likely}
            size={markSize}
            testId="person-language-mark"
            sx={{ position: 'absolute', bottom: -1, left: -1, border: edge }}
          />
        )}
        {exam && (
          <Box
            component="span"
            aria-hidden
            data-testid="person-exam-mark"
            sx={{
              position: 'absolute',
              top: -3,
              right: -5,
              height: markSize,
              minWidth: markSize,
              px: '3px',
              borderRadius: 999,
              display: 'inline-grid',
              placeItems: 'center',
              bgcolor: 'background.paper',
              color: 'text.primary',
              boxShadow: (theme) => `inset 0 0 0 1px ${theme.palette.text.secondary}`,
              border: edge,
              fontSize: Math.max(9, Math.round(markSize * 0.6)),
              fontWeight: 800,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
              userSelect: 'none',
            }}
          >
            {exam}
          </Box>
        )}
        {hot && (
          <Box
            component="span"
            aria-hidden
            data-testid="person-hot-mark"
            sx={{
              position: 'absolute',
              top: -1,
              left: -1,
              width: markSize,
              height: markSize,
              borderRadius: '50%',
              display: 'inline-grid',
              placeItems: 'center',
              bgcolor: HOT_COLOR,
              color: '#fff',
              border: edge,
              '& svg': { fontSize: Math.round(markSize * 0.72) },
            }}
          >
            <WhatshotIcon />
          </Box>
        )}
        {active && (
          <Box
            component="span"
            aria-hidden
            data-testid="person-active-mark"
            sx={{
              position: 'absolute',
              bottom: 1,
              right: 1,
              width: dot,
              height: dot,
              borderRadius: '50%',
              bgcolor: 'success.main',
              border: edge,
            }}
          />
        )}
      </AvatarRing>
    </Box>
  );

  return tooltip ? (
    <Tooltip
      title={
        <PersonGlanceCard
          name={displayName}
          ring={variant}
          role={role}
          facts={merged}
          language={language}
          loading={!known}
        />
      }
      enterDelay={250}
      enterNextDelay={150}
      disableInteractive
      componentsProps={{
        tooltip: {
          sx: {
            bgcolor: 'background.paper',
            color: 'text.primary',
            border: 1,
            borderColor: 'divider',
            boxShadow: 3,
            borderRadius: 2,
            p: 1.5,
            maxWidth: 300,
          },
        },
      }}
    >
      {avatar}
    </Tooltip>
  ) : (
    avatar
  );
}
