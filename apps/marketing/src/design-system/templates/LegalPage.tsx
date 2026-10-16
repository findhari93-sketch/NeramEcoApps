import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import DocLayout from './DocLayout';
import Surface from '../surface/Surface';
import PolicySwitcher from './PolicySwitcher';
import { tokens as t } from '../tokens';

export interface LegalSection {
  /** Anchor id (kebab or the message key). */
  id: string;
  title: ReactNode;
  body: ReactNode;
}

export interface LegalPageProps {
  title: ReactNode;
  /** "Last updated: 24 February 2026". */
  updated?: ReactNode;
  /** The policy switcher pills (Terms, Privacy, Refund). */
  policies?: Array<{ label: ReactNode; href: string; current?: boolean }>;
  sections: LegalSection[];
  /** Accessible name of the "On this page" rail. */
  railLabel?: string;
  /** A closing line under the article (contact for questions). */
  footer?: ReactNode;
}

/**
 * T9 Legal: a white header with the title, updated date and a policy pill
 * switcher; an "On this page" rail of anchor links beside a 700px article of
 * numbered sections. Server-rendered, no client JS.
 */
export default function LegalPage({ title, updated, policies = [], sections, railLabel = 'On this page', footer }: LegalPageProps) {
  const rail = (
    <Box component="nav" aria-label={railLabel} sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', gap: '2px' }}>
      {sections.map((s) => (
        <Box
          key={s.id}
          component="a"
          href={`#${s.id}`}
          sx={{
            minHeight: 36,
            display: 'flex',
            alignItems: 'center',
            px: 1.5,
            borderRadius: `${t.radius}px`,
            fontSize: '0.875rem',
            lineHeight: 1.35,
            color: t.inkMuted,
            textDecoration: 'none',
            '&:hover': { color: t.ink, bgcolor: t.surface },
            '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
          }}
        >
          {s.title}
        </Box>
      ))}
    </Box>
  );

  return (
    <>
      <Surface tone="white" component="header" sx={{ borderBottom: `1px solid ${t.line}` }}>
        <Box
          sx={{
            maxWidth: t.container.page,
            mx: 'auto',
            px: { xs: 2, sm: 3 },
            pt: { xs: 4, md: 5 },
            pb: { xs: 3, md: 4 },
            boxSizing: 'content-box',
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
          }}
        >
          <Typography component="h1" sx={{ m: 0, fontSize: 'clamp(2rem, 4.5vw, 2.75rem)', lineHeight: 1.1, fontWeight: 800, color: t.ink }}>
            {title}
          </Typography>
          {updated && <Typography sx={{ m: 0, fontSize: '0.875rem', color: t.inkMuted }}>{updated}</Typography>}
          {policies.length > 0 && <PolicySwitcher policies={policies} />}
        </Box>
      </Surface>

      <Box sx={{ bgcolor: t.ground }}>
        <DocLayout asideAt="start" aside={rail} articleWidth="legal">
          {sections.map((s) => (
            <Box key={s.id} component="section" id={s.id} aria-labelledby={`${s.id}-title`} sx={{ scrollMarginTop: 96, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              <Typography id={`${s.id}-title`} component="h2" sx={{ m: 0, fontSize: '1.25rem', lineHeight: 1.3, fontWeight: 800, color: t.ink }}>
                {s.title}
              </Typography>
              <Box
                sx={{
                  fontSize: '1rem',
                  lineHeight: 1.75,
                  color: t.ink,
                  '& p': { m: 0 },
                  '& p + p, & p + ul, & ul + p': { mt: 1.5 },
                  '& ul': { m: 0, pl: 3 },
                  '& li': { mb: 0.5 },
                  '& a': { color: t.ink, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '2px' },
                }}
              >
                {s.body}
              </Box>
            </Box>
          ))}
          {footer && <Box sx={{ borderTop: `1px solid ${t.line}`, pt: 2.5, fontSize: '0.9375rem', color: t.inkMuted, '& a': { color: t.ink, fontWeight: 600 } }}>{footer}</Box>}
        </DocLayout>
      </Box>
    </>
  );
}
