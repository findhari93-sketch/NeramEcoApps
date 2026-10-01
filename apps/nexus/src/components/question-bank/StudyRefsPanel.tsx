'use client';

import { useEffect, useState } from 'react';
import NextLink from 'next/link';
import { Box, Button, Chip, Link, Typography } from '@neram/ui';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import type { QBFoundationRef, QBNcertRef, QBQuestionStudyView } from '@neram/database';

/**
 * "What to study" under a question bank question.
 *
 * The founder's ask after a class: the chapter tag alone misled students (a
 * Functions question sat under Trigonometry because `sin x` appeared). This
 * names the chapter the question is really about, the chapters it leans on, and
 * for each concept the NCERT section or Foundation book section that teaches it.
 *
 * Before an answer it stays behind a button, so it is a hint a student asks for
 * rather than one handed to them. After an answer it is open.
 */

export function ncertLabel(ref: QBNcertRef): string {
  const chapter = `Class ${ref.class_level} · Ch ${ref.chapter_no} ${ref.chapter_title}`;
  return ref.section_no ? `${chapter}, ${ref.section_no} ${ref.section_title}` : chapter;
}

export function foundationLabel(ref: QBFoundationRef): string {
  return `Foundation Ch ${ref.chapter_number} · ${ref.section_title}`;
}

export function foundationHref(ref: QBFoundationRef, returnTo: string | null): string {
  const qs = new URLSearchParams({ section: ref.section_id });
  if (returnTo) qs.set('back', returnTo);
  return `/student/foundation/${ref.chapter_id}?${qs.toString()}`;
}

const linkSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.75,
  minHeight: 44,
  py: 0.5,
  fontWeight: 500,
  textAlign: 'left',
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2, borderRadius: 1 },
} as const;

function NcertLink({ target: r }: { target: QBNcertRef }) {
  const label = `NCERT ${ncertLabel(r)}`;
  return (
    <Link
      href={r.url}
      target="_blank"
      rel="noopener noreferrer"
      underline="hover"
      variant="body2"
      aria-label={`${label}, opens in a new tab`}
      sx={linkSx}
    >
      <MenuBookOutlinedIcon aria-hidden sx={{ fontSize: 18, flexShrink: 0 }} />
      <span>{label}</span>
      <OpenInNewIcon aria-hidden sx={{ fontSize: 14, flexShrink: 0 }} />
    </Link>
  );
}

function FoundationLink({ target: r, returnTo }: { target: QBFoundationRef; returnTo: string | null }) {
  return (
    <Link component={NextLink} href={foundationHref(r, returnTo)} underline="hover" variant="body2" sx={linkSx}>
      <PlayCircleOutlineIcon aria-hidden sx={{ fontSize: 18, flexShrink: 0 }} />
      <span>{foundationLabel(r)}</span>
    </Link>
  );
}

export interface StudyRefsPanelProps {
  study: QBQuestionStudyView | null | undefined;
  /** Open by default once the question is answered. */
  submitted: boolean;
}

export default function StudyRefsPanel({ study, submitted }: StudyRefsPanelProps) {
  const [asked, setAsked] = useState(false);
  // Where the Foundation section's Back should land: this question. Read after
  // mount, so the server render and the first client render agree.
  const [returnTo, setReturnTo] = useState<string | null>(null);
  useEffect(() => {
    setReturnTo(window.location.pathname + window.location.search);
  }, []);

  if (!study || (!study.primary && study.concepts.length === 0 && study.also_uses.length === 0)) return null;

  const open = submitted || asked;
  if (!open) {
    return (
      <Box sx={{ mb: 2 }}>
        <Button
          variant="text"
          startIcon={<LightbulbOutlinedIcon aria-hidden />}
          onClick={() => setAsked(true)}
          aria-expanded={false}
          sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600, px: 1 }}
        >
          Stuck? See what this question needs
        </Button>
      </Box>
    );
  }

  const primaryBeyond = study.primary?.ncert.some((r) => r.beyond_ncert);

  return (
    <Box
      component="section"
      aria-labelledby="study-refs-heading"
      sx={{ mb: 2, p: { xs: 1.5, sm: 2 }, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <MenuBookOutlinedIcon aria-hidden sx={{ color: 'primary.main' }} />
        <Typography id="study-refs-heading" variant="subtitle2" component="h3" sx={{ fontWeight: 700 }}>
          What to study
        </Typography>
      </Box>

      {study.primary && (
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600 }}>
            Chapter
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            {study.primary.label}
          </Typography>
          {study.primary.ncert.map((r) => (
            <Box key={r.ref}>
              <NcertLink target={r} />
            </Box>
          ))}
          {primaryBeyond && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              This goes beyond the current NCERT book. Start with the section above, then practise from your class notes.
            </Typography>
          )}
        </Box>
      )}

      {study.also_uses.length > 0 && (
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600, mb: 0.5 }}>
            Also uses
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {study.also_uses.map((c) => (
              <Chip key={c.slug} label={c.label} variant="outlined" size="small" sx={{ height: 28 }} />
            ))}
          </Box>
        </Box>
      )}

      {study.concepts.length > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600, mb: 0.5 }}>
            Concepts you need
          </Typography>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {study.concepts.map((c, i) => (
              <Box
                component="li"
                key={`${c.name}-${i}`}
                sx={{ py: 1, borderTop: i === 0 ? 'none' : '1px solid', borderColor: 'divider' }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {c.name}
                </Typography>
                {c.why && (
                  <Typography variant="body2" color="text.secondary">
                    {c.why}
                  </Typography>
                )}
                {c.ncert && <NcertLink target={c.ncert} />}
                {c.foundation && <FoundationLink target={c.foundation} returnTo={returnTo} />}
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
