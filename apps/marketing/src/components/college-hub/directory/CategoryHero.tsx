'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Box, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SearchIcon from '@mui/icons-material/Search';
import TuneIcon from '@mui/icons-material/Tune';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import { activeFilterCount, type FilterDraft } from './filter-model';
import type { SheetCategory } from './MobileFilterSheet';
import { hubType } from './hub-styles';
import { tokens } from '@/design-system';

/** What a category page is (built on the server, see lib/college-hub/categories.ts). */
export interface CategoryInfo {
  /** "Category · Accreditation" */
  eyebrow: string;
  /** The page H1 (kept as the old page had it, for search). */
  title: string;
  /** Short title for the phone header ("COA approved"). */
  shortTitle: string;
  subtitle: string;
  why?: { label: string; text: string };
  related: { label: string; href: string }[];
}

const srOnlyOnPhone = {
  position: { xs: 'absolute', md: 'static' },
  width: { xs: '1px', md: 'auto' },
  height: { xs: '1px', md: 'auto' },
  overflow: { xs: 'hidden', md: 'visible' },
  clip: { xs: 'rect(0 0 0 0)', md: 'auto' },
  whiteSpace: { xs: 'nowrap', md: 'normal' },
} as const;

function WhyPanel({ text, id }: { text: string; id: string }) {
  return (
    <Typography id={id} sx={{ m: 0, px: 2.25, py: 1.75, borderRadius: 1, bgcolor: tokens.surface, border: '1px solid', borderColor: tokens.line, boxShadow: `inset 3px 0 0 ${tokens.success}`, fontSize: '0.94rem', lineHeight: 1.6, color: tokens.ink, maxWidth: 900 }}>
      {text}
    </Typography>
  );
}

/** Desktop band of a category page (canvas: Desktop · Category page, top). Phones get the H1 only, hidden; see MobileCategoryHeader. */
export default function CategoryHero({ category, breadcrumbs }: { category: CategoryInfo; breadcrumbs?: React.ReactNode }) {
  const [why, setWhy] = useState(false);
  return (
    <Box component="section" aria-labelledby="cat-title" sx={{ display: 'flex', flexDirection: 'column', gap: { md: 2 } }}>
      {breadcrumbs && <Box sx={{ display: { xs: 'none', md: 'block' }, '& nav': { mb: 0 } }}>{breadcrumbs}</Box>}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px 32px' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: '1 1 520px', minWidth: 0 }}>
          <Typography component="p" sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 0.75, m: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: tokens.success }}>
            <VerifiedUserOutlinedIcon aria-hidden sx={{ fontSize: 16 }} />
            {category.eyebrow}
          </Typography>
          <Typography id="cat-title" component="h1" sx={{ m: 0, fontSize: hubType.pageTitle, lineHeight: 1.15, fontWeight: 800, letterSpacing: '-0.02em', textWrap: 'balance', ...srOnlyOnPhone }}>
            {category.title}
          </Typography>
          <Typography sx={{ display: { xs: 'none', md: 'block' }, m: 0, fontSize: hubType.subtitle, lineHeight: 1.5, color: tokens.inkMuted }}>{category.subtitle}</Typography>
        </Box>
        {category.why && (
          <Box
            component="button"
            type="button"
            aria-expanded={why}
            aria-controls="cat-why"
            onClick={() => setWhy((v) => !v)}
            sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1, height: 44, px: 1.75, border: '1px solid', borderColor: tokens.lineStrong, borderRadius: 1, bgcolor: tokens.surface, color: tokens.ink, font: 'inherit', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 2 } }}
          >
            <InfoOutlinedIcon aria-hidden sx={{ fontSize: 18 }} />
            {category.why.label}
          </Box>
        )}
      </Box>
      {category.why && why && (
        <Box sx={{ display: { xs: 'none', md: 'block' } }}>
          <WhyPanel id="cat-why" text={category.why.text} />
        </Box>
      )}
      {category.related.length > 0 && (
        <Box component="nav" aria-label="Related categories" sx={{ display: { xs: 'none', md: 'flex' }, flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
          <Box component="span" sx={{ fontSize: hubType.meta, color: tokens.inkMuted, mr: 0.5 }}>Also browse</Box>
          {category.related.map((r) => (
            <Box
              key={r.href}
              component={Link}
              href={r.href}
              sx={{ display: 'flex', alignItems: 'center', minHeight: 36, px: 1.75, border: '1px solid', borderColor: tokens.lineStrong, borderRadius: `${tokens.radiusPill}px`, bgcolor: tokens.surface, color: tokens.ink, fontSize: 13, fontWeight: 600, textDecoration: 'none', '&:hover': { borderColor: tokens.navy900, color: tokens.navy900 }, '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 2 } }}
            >
              {r.label}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

interface MobileProps {
  category: CategoryInfo;
  subtitle: string;
  states: { state: string; state_slug: string; count: number }[];
  draft: FilterDraft;
  onChange: (next: FilterDraft) => void;
  onOpenSheet: (category: SheetCategory) => void;
  showStates: boolean;
}

const stateChip = (on: boolean) => ({
  minHeight: 36,
  px: 1.75,
  border: '1px solid',
  borderColor: on ? tokens.navy900 : tokens.lineStrong,
  borderRadius: `${tokens.radiusPill}px`,
  bgcolor: on ? tokens.navy900 : tokens.surface,
  color: on ? tokens.paper : tokens.ink,
  font: 'inherit',
  fontSize: '0.86rem',
  fontWeight: 600,
  whiteSpace: 'nowrap' as const,
  cursor: 'pointer',
  '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 2 },
});

/** Phone header of a category page (canvas: Mobile · Category results). */
export function MobileCategoryHeader({ category, subtitle, states, draft, onChange, onOpenSheet, showStates }: MobileProps) {
  const [why, setWhy] = useState(false);
  const [q, setQ] = useState(draft.q);
  useEffect(() => setQ(draft.q), [draft.q]);
  useEffect(() => {
    if (q === draft.q) return;
    const t = window.setTimeout(() => onChange({ ...draft, q }), 500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const active = activeFilterCount(draft);
  const one = draft.state.length === 1 ? draft.state[0] : null;

  return (
    <Box component="header" sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: 1, mx: -2, bgcolor: tokens.surface, borderBottom: '1px solid', borderColor: tokens.line }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, minHeight: 52, pl: 0.5, pr: 1 }}>
        <Box component={Link} href="/colleges" aria-label="Back to colleges" sx={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tokens.ink, borderRadius: '50%', '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 2 } }}>
          <ArrowBackIcon aria-hidden />
        </Box>
        <Box sx={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', px: 0.5, py: 0.5 }}>
          <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: '1.1rem', fontWeight: 700, lineHeight: 1.25 }}>
            <VerifiedUserOutlinedIcon aria-hidden sx={{ fontSize: 17, color: tokens.success }} />
            {category.shortTitle}
          </Box>
          <Box component="span" sx={{ fontSize: '0.8rem', color: tokens.inkMuted }}>{subtitle}</Box>
        </Box>
        {category.why && (
          <Box
            component="button"
            type="button"
            aria-label={category.why.label}
            aria-expanded={why}
            aria-controls="cat-why-m"
            onClick={() => setWhy((v) => !v)}
            sx={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, bgcolor: 'transparent', color: why ? tokens.navy900 : tokens.inkMuted, cursor: 'pointer', borderRadius: '50%', '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 2 } }}
          >
            <InfoOutlinedIcon aria-hidden />
          </Box>
        )}
      </Box>
      {category.why && why && (
        <Box sx={{ px: 2 }}>
          <WhyPanel id="cat-why-m" text={category.why.text} />
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 1, px: 2 }}>
        <Box sx={{ flex: '1 1 auto', display: 'flex', alignItems: 'center', gap: 1, height: 44, px: 1.5, boxSizing: 'border-box', borderRadius: 1, bgcolor: tokens.surfaceHover, color: tokens.inkMuted, '&:focus-within': { outline: tokens.focusOutline, outlineOffset: 2 } }}>
          <SearchIcon aria-hidden sx={{ fontSize: 20 }} />
          <Box component="label" htmlFor="m-cat-q" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
            Search in {category.shortTitle}
          </Box>
          <Box
            component="input"
            id="m-cat-q"
            type="search"
            enterKeyHint="search"
            value={q}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
            placeholder={`Search in ${category.shortTitle}`}
            sx={{ flex: '1 1 auto', minWidth: 0, border: 0, outline: 'none', font: 'inherit', fontSize: '1rem', color: tokens.ink, bgcolor: 'transparent' }}
          />
        </Box>
        <Box
          component="button"
          type="button"
          onClick={() => onOpenSheet('sort')}
          aria-label={active ? `Filters, ${active} active` : 'Filters'}
          sx={{ position: 'relative', flex: '0 0 44px', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 1, bgcolor: tokens.navy900, color: tokens.paper, cursor: 'pointer', '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 2 } }}
        >
          <TuneIcon aria-hidden />
          {active > 0 && (
            <Box component="span" sx={{ position: 'absolute', top: -5, right: -5, minWidth: 20, height: 20, px: 0.5, boxSizing: 'border-box', borderRadius: `${tokens.radiusPill}px`, bgcolor: tokens.navy900, color: tokens.paper, border: '2px solid', borderColor: tokens.surface, fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {active}
            </Box>
          )}
        </Box>
      </Box>

      {showStates && states.length > 1 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, pl: 2, pb: 1.25 }}>
          <Box component="span" sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: tokens.inkMuted }}>
            State
          </Box>
          <Box component="ul" aria-label="Filter by state" sx={{ listStyle: 'none', m: 0, p: 0, pr: 2, display: 'flex', gap: 0.75, overflowX: 'auto', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
            <li>
              <Box component="button" type="button" aria-pressed={draft.state.length === 0} onClick={() => onChange({ ...draft, state: [], city: [] })} sx={stateChip(draft.state.length === 0)}>
                All India
              </Box>
            </li>
            {states.slice(0, 8).map((s) => (
              <li key={s.state_slug}>
                <Box
                  component="button"
                  type="button"
                  aria-pressed={one === s.state_slug}
                  onClick={() => onChange({ ...draft, state: one === s.state_slug ? [] : [s.state_slug], city: [] })}
                  sx={stateChip(one === s.state_slug)}
                >
                  {s.state}
                </Box>
              </li>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
