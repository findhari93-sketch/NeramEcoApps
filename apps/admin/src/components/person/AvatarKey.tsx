'use client';

/**
 * The key to PersonAvatar: what each ring and each corner letter means.
 *
 * An info button in a page header opens it. Every sample is drawn with the real
 * AvatarRing and LanguageMark, so the key can never drift from what the lists show.
 */
import { useState } from 'react';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {
  AvatarRing,
  Box,
  IconButton,
  LANGUAGES,
  LanguageMark,
  Popover,
  Tooltip,
  Typography,
  UserAvatar,
  type AvatarRingVariant,
  type LanguageKey,
} from '@neram/ui';
import { RING_HELP, RING_LABEL } from '@/lib/person-avatar';
import PersonAvatar from './PersonAvatar';

const RINGS: Exclude<AvatarRingVariant, 'none'>[] = ['student', 'paused', 'alumni', 'lead', 'staff', 'other'];
const MARKED: LanguageKey[] = ['tamil', 'hindi', 'kannada', 'malayalam', 'telugu'];
const SAMPLE = 28;

function Row({ sample, title, help }: { sample: React.ReactNode; title: string; help: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box sx={{ width: SAMPLE + 6, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>{sample}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
          {help}
        </Typography>
      </Box>
    </Box>
  );
}

export default function AvatarKey() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  return (
    <>
      <Tooltip title="What do the avatar rings mean?">
        <IconButton
          aria-label="What do the avatar rings mean?"
          aria-haspopup="dialog"
          aria-expanded={anchor ? 'true' : undefined}
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{ width: 44, height: 44, color: 'text.secondary' }}
        >
          <InfoOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 340, p: 2, borderRadius: 2 } } }}
      >
        <Box role="dialog" aria-label="Avatar key" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.5 }}>
            The ring: who they are to us
          </Typography>
          {RINGS.map((variant) => (
            <Row
              key={variant}
              title={RING_LABEL[variant]}
              help={RING_HELP[variant]}
              sample={
                <AvatarRing variant={variant} size={SAMPLE}>
                  <UserAvatar name={RING_LABEL[variant]} size={SAMPLE} clickable={false} />
                </AvatarRing>
              }
            />
          ))}

          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.5, mt: 0.5 }}>
            The corners: more at a glance
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Box sx={{ p: 1, flexShrink: 0 }}>
              <PersonAvatar
                name="Hot lead"
                size={48}
                tooltip={false}
                facts={{ userType: 'lead', interest: 'hot', examYear: 2027, engagement: 'engaged', homeLanguage: 'tamil' }}
                editable={false}
              />
            </Box>
            <Box component="ul" sx={{ m: 0, pl: 0, listStyle: 'none', display: 'grid', gap: 0.5 }}>
              {[
                ['Top right', 'Exam year: 27 is the 2027 exam. Orange: a break year (finished 12th, has results)'],
                ['Top left', 'Flame: a hot lead'],
                ['Bottom left', 'Their language'],
                ['Bottom right', 'Green dot: active this week'],
              ].map(([where, what]) => (
                <Typography key={where} component="li" variant="caption" sx={{ lineHeight: 1.4 }}>
                  <Box component="span" sx={{ fontWeight: 700 }}>{where}:</Box> {what}
                </Typography>
              ))}
            </Box>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>
            Hover any photo for a short card: class, language, place, classroom, stage and last active. Click a
            student or lead's photo to set their class or language.
          </Typography>

          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.5, mt: 0.5 }}>
            The letter: the language they follow
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
            {MARKED.map((key) => (
              <Box key={key} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                <LanguageMark language={key} size={18} />
                <Typography variant="caption">{LANGUAGES[key].label}</Typography>
              </Box>
            ))}
          </Box>
          <Row
            sample={<LanguageMark language="tamil" size={18} />}
            title="Black letter"
            help="Staff recorded it. No letter means English."
          />
          <Row
            sample={<LanguageMark language="tamil" size={18} likely />}
            title="Grey letter"
            help="A guess from their state, city or site language. Confirm it on their page."
          />
          <Row
            sample={<LanguageMark language="tamil" size={18} limitedEnglish />}
            title="Outlined letter"
            help="Limited English: use their language with them."
          />
        </Box>
      </Popover>
    </>
  );
}
