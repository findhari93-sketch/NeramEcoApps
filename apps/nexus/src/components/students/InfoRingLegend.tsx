'use client';

import { useState, type ReactNode } from 'react';
import { Box, Divider, Drawer, IconButton, Typography, useMediaQuery } from '@neram/ui';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { INFO_RING_NAME, INFO_RING_STATES } from '@/lib/student-info-ring';
import {
  LANGUAGES,
  LANGUAGE_ORDER,
  LIMITED_ENGLISH_HELP,
  LIMITED_ENGLISH_LABEL,
} from '@/lib/student-language';
import { REDUCED_MOTION_QUERY } from '@/components/timetable/timetable-theme';
import StudentStageAvatar from './StudentStageAvatar';
import LanguageMark from './LanguageMark';

/**
 * The key to the student info ring.
 *
 * Until this existed nothing in Nexus explained the ring. A teacher could only
 * learn it by long-pressing one face at a time and reading a tooltip, which is
 * how a signal designed to be read in one glance ends up being read by nobody.
 *
 * Every swatch is a REAL StudentStageAvatar, not a hand-drawn circle, and every
 * word comes from INFO_RING_STATES, which is folded out of student-stage.ts. So
 * the legend cannot promise a colour the avatars do not draw, and a sixth stage
 * would appear here the day it is added.
 */

const SWATCH_SIZE = 28;

function LegendRow({ swatch, title, body }: { swatch: ReactNode; title: string; body: string }) {
  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', py: 0.75 }}>
      {/*
        Decorative: the swatch repeats what the two lines beside it already say,
        and the avatar underneath carries an aria-label of its own that would
        otherwise be read out twice.
      */}
      <Box
        aria-hidden
        sx={{ flexShrink: 0, width: SWATCH_SIZE + 12, display: 'flex', justifyContent: 'center' }}
      >
        {swatch}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', lineHeight: 1.4 }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: '0.8125rem', lineHeight: 1.5, color: 'text.secondary' }}>
          {body}
        </Typography>
      </Box>
    </Box>
  );
}

export interface InfoRingLegendProps {
  open: boolean;
  onClose: () => void;
  /**
   * An optional first section for the screen that opened it, so one button can
   * explain the page and the ring instead of two competing info affordances.
   */
  intro?: { title: string; body: string } | null;
}

export default function InfoRingLegend({ open, onClose, intro = null }: InfoRingLegendProps) {
  const prefersReducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      transitionDuration={prefersReducedMotion ? 0 : undefined}
      PaperProps={{
        sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '88dvh' },
        // A Drawer's paper carries no role of its own, so a screen reader would
        // announce an unnamed group. MUI's Modal already traps focus, restores
        // it to the trigger and closes on Escape; this names what it trapped.
        role: 'dialog',
        'aria-modal': true,
        'aria-labelledby': 'info-ring-legend-title',
      }}
      data-testid="info-ring-legend"
    >
      <Box sx={{ p: 2, pb: 3, overflowY: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.5 }}>
          <Typography
            id="info-ring-legend-title"
            component="h2"
            sx={{ fontWeight: 800, fontSize: '1.05rem', flex: 1, minWidth: 0, mt: 1 }}
          >
            {INFO_RING_NAME}
          </Typography>
          <IconButton
            aria-label="Close"
            onClick={onClose}
            sx={{ width: 48, height: 48, flexShrink: 0, color: 'text.secondary' }}
          >
            <CloseOutlinedIcon />
          </IconButton>
        </Box>

        <Typography
          sx={{ fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.5, mb: 1.5 }}
        >
          Every student photo in Nexus wears a ring. It answers who you are looking at before you
          open anything.
        </Typography>

        {intro && (
          <>
            <Typography sx={{ fontWeight: 700, fontSize: '0.8125rem', mb: 0.5 }}>
              {intro.title}
            </Typography>
            <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.5 }}>
              {intro.body}
            </Typography>
            <Divider sx={{ my: 1.5 }} />
          </>
        )}

        <Typography sx={{ fontWeight: 700, fontSize: '0.8125rem', mb: 0.5 }}>
          The ring: where they are in school
        </Typography>
        <Box>
          {INFO_RING_STATES.map((state) => (
            <LegendRow
              key={state.key}
              title={state.label}
              body={state.meaning}
              swatch={
                <StudentStageAvatar
                  stage={state.key === 'dormant' ? 'unset' : state.key}
                  dormant={state.key === 'dormant'}
                  language={null}
                  name="Student"
                  size={SWATCH_SIZE}
                  tapToView={false}
                />
              }
            />
          ))}
        </Box>

        <Divider sx={{ my: 1.5 }} />

        <Typography sx={{ fontWeight: 700, fontSize: '0.8125rem', mb: 0.5 }}>
          The letter: the language they speak at home
        </Typography>
        <Typography
          sx={{ fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.5, mb: 1 }}
        >
          A letter at the bottom left of the photo. Most students have none, because English is the
          default and every student here knows it.
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
          {LANGUAGE_ORDER.filter((key) => key !== 'english').map((key) => (
            <Box
              key={key}
              data-testid={`legend-language-${key}`}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                px: 1,
                py: 0.5,
                borderRadius: 2,
                border: (theme) => `1px solid ${theme.palette.divider}`,
              }}
            >
              <LanguageMark language={key} size={22} />
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                {LANGUAGES[key].label}
              </Typography>
            </Box>
          ))}
        </Box>

        <LegendRow
          title={LIMITED_ENGLISH_LABEL}
          body={LIMITED_ENGLISH_HELP}
          swatch={<LanguageMark language="tamil" limitedEnglish size={22} />}
        />
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.5, pl: 5 }}>
          The letter is outlined instead of filled, whichever language it is.
        </Typography>
      </Box>
    </Drawer>
  );
}

/**
 * The info button plus the sheet it opens, so a screen adopts the legend in one
 * line. 48px, the same touch target every other icon button on these screens
 * uses.
 */
export function InfoRingLegendButton({
  label = 'What the ring and the letter mean',
  intro = null,
}: {
  label?: string;
  intro?: InfoRingLegendProps['intro'];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        aria-label={label}
        onClick={() => setOpen(true)}
        data-testid="info-ring-legend-button"
        sx={{ width: 48, height: 48, flexShrink: 0, color: 'text.secondary' }}
      >
        <InfoOutlinedIcon sx={{ fontSize: 18 }} />
      </IconButton>
      <InfoRingLegend open={open} onClose={() => setOpen(false)} intro={intro} />
    </>
  );
}
