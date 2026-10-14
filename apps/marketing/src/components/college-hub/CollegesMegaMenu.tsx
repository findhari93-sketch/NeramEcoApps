'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import CheckIcon from '@mui/icons-material/Check';

export interface MegaMenuColumn {
  title: string;
  links: { label: string; href: string }[];
}

interface Props {
  /** Link columns (the header's Colleges nav group); the last link of each is its "more" link. */
  columns: MegaMenuColumn[];
  pathname: string;
  onNavigate: () => void;
}

const TOOLS = [
  { href: '/colleges/compare', label: 'Compare colleges', hint: 'Up to 4, side by side', Icon: CompareArrowsIcon, tone: 'primary' as const },
  { href: '/colleges/saved', label: 'Saved colleges', hint: 'Your shortlist', Icon: FavoriteBorderIcon, tone: 'secondary' as const },
  { href: '/colleges#explore', label: 'Browse by city', hint: 'Colleges near you', Icon: PlaceOutlinedIcon, tone: 'success' as const },
  { href: '/tools/college-predictor', label: 'College predictor', hint: 'Colleges for your score', Icon: CalculateOutlinedIcon, tone: 'warning' as const },
];

function isCurrent(pathname: string, href: string) {
  const path = href.split(/[?#]/)[0];
  if (path === '/colleges') return false;
  return pathname === path || pathname.replace(/^\/[a-z]{2}(?=\/)/, '') === path;
}

/** Desktop Colleges menu (canvas: Desktop · Colleges menu). */
export default function CollegesMegaMenu({ columns, pathname, onNavigate }: Props) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const linkColumns = columns.slice(0, 3);

  return (
    <Box component="section" aria-label="Colleges menu" sx={{ width: 'min(1100px, 94vw)', overflow: 'hidden', borderRadius: 2 }}>
      <Box
        component="form"
        role="search"
        onSubmit={(e: React.FormEvent) => {
          e.preventDefault();
          const term = q.trim();
          onNavigate();
          router.push(term ? `/colleges?q=${encodeURIComponent(term)}#browse` : '/colleges#browse');
        }}
        sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 20px', px: 3.5, py: 2.25, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Box sx={{ flex: '1 1 420px', display: 'flex', alignItems: 'center', gap: 1.25, height: 46, px: 1.75, boxSizing: 'border-box', border: '1.5px solid', borderColor: 'grey.400', borderRadius: 2, color: 'text.secondary', '&:focus-within': { borderColor: 'primary.main' } }}>
          <SearchIcon aria-hidden sx={{ fontSize: 20 }} />
          <Box component="label" htmlFor="mega-q" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
            Search colleges
          </Box>
          <Box
            component="input"
            id="mega-q"
            type="search"
            value={q}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
            placeholder="Search a college or city"
            sx={{ flex: '1 1 auto', minWidth: 0, border: 0, outline: 'none', font: 'inherit', fontSize: '1rem', color: 'text.primary', bgcolor: 'transparent' }}
          />
        </Box>
        <Typography sx={{ m: 0, fontSize: '0.9rem', color: 'text.secondary' }}>Or browse by one of these</Typography>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr)) 264px' }}>
        {linkColumns.map((col) => {
          const items = col.links.slice(0, -1);
          const more = col.links[col.links.length - 1];
          return (
            <Box component="nav" key={col.title} aria-label={col.title} sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, px: 2, py: 2.5, borderRight: '1px solid', borderColor: 'divider' }}>
              <Typography component="h2" sx={{ m: 0, mb: 1, mx: 1.5, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
                {col.title}
              </Typography>
              {items.map((l) => {
                const on = isCurrent(pathname, l.href);
                return (
                  <Box
                    key={l.href + l.label}
                    component={Link}
                    href={l.href}
                    onClick={onNavigate}
                    aria-current={on ? 'page' : undefined}
                    sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, minHeight: 42, px: 1.5, borderRadius: 1.5, bgcolor: (t) => (on ? alpha(t.palette.primary.main, 0.1) : 'transparent'), color: on ? 'primary.dark' : 'text.primary', fontSize: '0.94rem', fontWeight: on ? 700 : 500, textDecoration: 'none', '&:hover': { bgcolor: 'action.hover' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 } }}
                  >
                    {l.label}
                    {on && <CheckIcon aria-hidden sx={{ fontSize: 16 }} />}
                  </Box>
                );
              })}
              {more && (
                <Box
                  component={Link}
                  href={more.href}
                  onClick={onNavigate}
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minHeight: 42, mt: 0.75, px: 1.5, borderRadius: 1.5, color: 'primary.dark', fontSize: '0.9rem', fontWeight: 700, textDecoration: 'none', '&:hover': { bgcolor: 'action.hover' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 } }}
                >
                  {more.label}
                  <ArrowForwardIcon aria-hidden sx={{ fontSize: 16 }} />
                </Box>
              )}
            </Box>
          );
        })}

        <Box component="nav" aria-label="Your tools" sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, px: 2.5, py: 2.5, bgcolor: 'action.hover' }}>
          <Typography component="h2" sx={{ m: 0, mb: 1, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
            Your tools
          </Typography>
          {TOOLS.map(({ href, label, hint, Icon, tone }) => (
            <Box
              key={href}
              component={Link}
              href={href}
              onClick={onNavigate}
              sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 52, px: 1.5, borderRadius: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', color: 'text.primary', textDecoration: 'none', '&:hover': { borderColor: 'primary.main' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}
            >
              <Box aria-hidden sx={{ width: 32, height: 32, flex: '0 0 32px', borderRadius: 1, bgcolor: (t) => alpha(t.palette[tone].main, 0.12), color: `${tone}.dark`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon sx={{ fontSize: 18 }} />
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <Box component="span" sx={{ fontSize: '0.92rem', fontWeight: 700 }}>{label}</Box>
                <Box component="span" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{hint}</Box>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px 20px', px: 3.5, py: 1.75, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'action.hover' }}>
        <Typography sx={{ m: 0, fontSize: '0.9rem', color: 'text.secondary' }}>
          <Box component="b" sx={{ color: 'text.primary' }}>B.Arch colleges across India</Box>, with fees, seats and admission routes.
        </Typography>
        <Box component={Link} href="/colleges#browse" onClick={onNavigate} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minHeight: 40, fontSize: '0.92rem', fontWeight: 700, color: 'primary.dark', textDecoration: 'none' }}>
          Browse all colleges
          <ArrowForwardIcon aria-hidden sx={{ fontSize: 16 }} />
        </Box>
      </Box>
    </Box>
  );
}
