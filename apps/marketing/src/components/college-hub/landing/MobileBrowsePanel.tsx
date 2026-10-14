'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';

interface Props {
  states: Array<{ state_slug: string; state: string; count: number }>;
  counseling: Array<{ system: string; count: number }>;
  coaApprovedCount: number;
  totalColleges: number;
}

type Tab = 'state' | 'exam' | 'rank';

const TABS: { id: Tab; label: string }[] = [
  { id: 'state', label: 'By state' },
  { id: 'exam', label: 'Exam' },
  { id: 'rank', label: 'Rankings' },
];

const rowSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 1.5,
  minHeight: 58,
  px: 1.75,
  color: 'text.primary',
  textDecoration: 'none',
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
};

/** Phone browse panel on /colleges (canvas: Mobile · Browse colleges). Hidden from 900px up. */
export default function MobileBrowsePanel({ states, counseling, coaApprovedCount, totalColleges }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('state');
  const [allStates, setAllStates] = useState(false);
  const [q, setQ] = useState('');

  const counselingCount = (key: string) => counseling.find((c) => c.system === key)?.count;
  const examRows = [
    { label: 'NATA colleges', hint: 'Admit with a NATA score', href: '/colleges?exam=NATA#browse' },
    { label: 'JEE Main Paper 2 colleges', hint: 'Admit with a JEE B.Arch score', href: '/colleges?exam=JEE_PAPER_2#browse' },
    { label: 'TNEA counselling', hint: counselingCount('TNEA') ? `Tamil Nadu · ${counselingCount('TNEA')} colleges` : 'Tamil Nadu', href: '/colleges/tnea' },
    { label: 'JoSAA counselling', hint: 'NITs, SPAs and IITs', href: '/colleges/josaa' },
    { label: 'KEAM counselling', hint: 'Kerala', href: '/counseling/keam-arch' },
    { label: 'KCET counselling', hint: 'Karnataka', href: '/colleges/counseling/kcet' },
  ];
  const rankRows = [
    { label: 'COA approved', hint: coaApprovedCount ? `${coaApprovedCount} colleges` : 'Approved by the Council of Architecture', href: '/colleges/accreditation/coa-approved' },
    { label: 'NIRF Architecture', hint: 'National ranking', href: '/colleges/rankings/nirf' },
    { label: 'ArchIndex top rated', hint: 'Neram score', href: '/colleges/rankings/archindex' },
    { label: 'Government colleges', hint: 'State and central', href: '/colleges/type/government' },
    { label: 'Private colleges', hint: 'Including deemed universities', href: '/colleges/type/private' },
    { label: 'Fee under ₹3L', hint: 'Per year', href: '/colleges/fees/below-3-lakhs' },
  ];
  // Most colleges first.
  const byCount = [...states].sort((a, b) => b.count - a.count);
  const visibleStates = allStates ? byCount : byCount.slice(0, 8);

  return (
    <Box component="section" aria-labelledby="mobile-browse-title" sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: 2, px: 2, py: 3, bgcolor: 'background.paper' }}>
      <Box>
        <Typography id="mobile-browse-title" component="h2" sx={{ m: 0, fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
          Browse colleges
        </Typography>
        {totalColleges > 0 && (
          <Typography sx={{ m: 0, mt: 0.25, fontSize: '0.88rem', color: 'text.secondary' }}>
            {totalColleges.toLocaleString('en-IN')} B.Arch colleges across India
          </Typography>
        )}
      </Box>

      <Box
        component="form"
        role="search"
        onSubmit={(e: React.FormEvent) => {
          e.preventDefault();
          const term = q.trim();
          router.push(term ? `/colleges?q=${encodeURIComponent(term)}#browse` : '/colleges#browse');
        }}
        sx={{ display: 'flex', alignItems: 'center', gap: 1, height: 48, px: 1.75, boxSizing: 'border-box', borderRadius: 1.5, bgcolor: 'action.hover', color: 'text.secondary', '&:focus-within': { outline: '2px solid', outlineColor: 'primary.main' } }}
      >
        <SearchIcon aria-hidden sx={{ fontSize: 20 }} />
        <Box component="label" htmlFor="mb-q" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
          Search colleges
        </Box>
        <Box
          component="input"
          id="mb-q"
          type="search"
          enterKeyHint="search"
          value={q}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
          placeholder="Search a college or city"
          sx={{ flex: '1 1 auto', minWidth: 0, border: 0, outline: 'none', font: 'inherit', fontSize: '1rem', color: 'text.primary', bgcolor: 'transparent' }}
        />
      </Box>

      <Box role="group" aria-label="Browse by" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', p: 0.5, borderRadius: 1.5, bgcolor: 'action.hover' }}>
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <Box
              key={t.id}
              component="button"
              type="button"
              aria-pressed={on}
              onClick={() => setTab(t.id)}
              sx={{ height: 44, border: 0, borderRadius: 1.25, bgcolor: on ? 'background.paper' : 'transparent', boxShadow: on ? '0 1px 3px rgba(15,27,45,0.15)' : 'none', color: on ? 'text.primary' : 'text.secondary', font: 'inherit', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 } }}
            >
              {t.label}
            </Box>
          );
        })}
      </Box>

      {tab === 'state' ? (
        <Box component="nav" aria-label="Colleges by state" sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
            {visibleStates.map((s) => (
              <li key={s.state_slug}>
                <Box
                  component={Link}
                  href={`/colleges/${s.state_slug}`}
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.75, minHeight: 56, px: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, color: 'text.primary', textDecoration: 'none', '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}
                >
                  <Box component="span" sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <Box component="span" sx={{ fontSize: '0.92rem', fontWeight: 700, lineHeight: 1.3 }}>{s.state}</Box>
                    <Box component="span" sx={{ fontSize: '0.76rem', color: 'text.secondary' }}>{s.count} {s.count === 1 ? 'college' : 'colleges'}</Box>
                  </Box>
                  <ChevronRightIcon aria-hidden sx={{ fontSize: 18, color: 'text.secondary', flex: '0 0 auto' }} />
                </Box>
              </li>
            ))}
          </Box>
          {states.length > 8 && (
            <Box
              component="button"
              type="button"
              aria-expanded={allStates}
              onClick={() => setAllStates((v) => !v)}
              sx={{ height: 48, border: 0, borderRadius: 1.5, bgcolor: 'action.hover', color: 'text.primary', font: 'inherit', fontSize: '0.94rem', fontWeight: 700, cursor: 'pointer', '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}
            >
              {allStates ? 'Show fewer states' : `All ${states.length} states`}
            </Box>
          )}
        </Box>
      ) : (
        <Box component="nav" aria-label={tab === 'exam' ? 'Colleges by exam and counselling' : 'Colleges by ranking and filter'}>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
            {(tab === 'exam' ? examRows : rankRows).map((r, i) => (
              <Box component="li" key={r.href} sx={{ borderTop: i ? '1px solid' : 0, borderColor: 'divider' }}>
                <Box component={Link} href={r.href} sx={rowSx}>
                  <Box component="span" sx={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 0.125 }}>
                    <Box component="span" sx={{ fontSize: '0.95rem', fontWeight: 600 }}>{r.label}</Box>
                    <Box component="span" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{r.hint}</Box>
                  </Box>
                  <ChevronRightIcon aria-hidden sx={{ fontSize: 20, color: 'text.secondary' }} />
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      <Box component="nav" aria-labelledby="mobile-tools-title" sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        <Typography id="mobile-tools-title" component="h3" sx={{ m: 0, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
          Your tools
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
          {[
            { href: '/colleges/compare', label: 'Compare', Icon: CompareArrowsIcon, tone: 'primary' as const },
            { href: '/colleges/saved', label: 'Saved', Icon: FavoriteBorderIcon, tone: 'secondary' as const },
            { href: '/colleges#explore', label: 'By city', Icon: PlaceOutlinedIcon, tone: 'success' as const },
          ].map(({ href, label, Icon, tone }) => (
            <Box
              key={href}
              component={Link}
              href={href}
              sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, minHeight: 72, p: 1.5, borderRadius: 1.5, bgcolor: (t) => alpha(t.palette[tone].main, 0.1), color: 'text.primary', fontSize: '0.9rem', fontWeight: 700, textDecoration: 'none', '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}
            >
              <Icon aria-hidden sx={{ fontSize: 22, color: `${tone}.dark` }} />
              {label}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
