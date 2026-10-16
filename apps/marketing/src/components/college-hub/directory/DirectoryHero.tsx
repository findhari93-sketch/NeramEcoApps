'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Box, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import type { ListingCollege } from '@/lib/college-hub/listing-filter';
import { typeKey } from '@/lib/college-hub/listing-filter';
import { annualFee, formatRupees } from '@/lib/college-hub/format';
import { hubType, statLabelSx } from './hub-styles';
import HubSelect from './HubSelect';
import { tokens } from '@/design-system';

export interface StateOption {
  state_slug: string;
  state: string;
  count: number;
}

interface Props {
  /** Present on /colleges/[state]; absent on the /colleges Browse all section. */
  stateSlug?: string;
  stateName?: string;
  states?: StateOption[];
  /** The full result set the KPIs describe (the state's list). */
  colleges?: ListingCollege[];
  totalCount: number;
  cities: { city: string; city_slug: string; count: number }[];
  q: string;
  city: string[];
  onSearch: (q: string, city: string | undefined) => void;
  /** Rendered at the top of the band on desktop (canvas). */
  breadcrumbs?: React.ReactNode;
}

function kpis(colleges: ListingCollege[]) {
  const byType = (k: string) => colleges.filter((c) => typeKey(c.type) === k).length;
  const fees = colleges.map(annualFee).filter((f): f is number => f != null);
  const cities = new Set(colleges.map((c) => c.city_slug).filter(Boolean));
  const out = [
    { label: 'Colleges', value: String(colleges.length) },
    { label: 'Government', value: String(byType('government')) },
    { label: 'Private', value: String(byType('private')) },
    { label: 'Deemed', value: String(byType('deemed')) },
  ];
  if (fees.length) {
    const lo = Math.min(...fees);
    const hi = Math.max(...fees);
    out.push({ label: 'Annual fee range', value: lo === hi ? formatRupees(lo) : `${formatRupees(lo)} to ${formatRupees(hi)}` });
  }
  out.push({ label: 'Cities', value: String(cities.size) });
  return out;
}

/** Visually hidden below 900px (MobileDirectoryHeader shows the place there); keeps one H1 on the page. */
const srOnlyOnPhone = {
  position: { xs: 'absolute', md: 'static' },
  width: { xs: '1px', md: 'auto' },
  height: { xs: '1px', md: 'auto' },
  overflow: { xs: 'hidden', md: 'visible' },
  clip: { xs: 'rect(0 0 0 0)', md: 'auto' },
  whiteSpace: { xs: 'nowrap', md: 'normal' },
} as const;

/** Top band of the directory (canvas: Desktop · List view header). Phones get MobileDirectoryHeader; only the H1 stays (visually hidden). */
export default function DirectoryHero({ stateSlug, stateName, states, colleges, totalCount, cities, q, city, onSearch, breadcrumbs }: Props) {
  const router = useRouter();
  const [text, setText] = useState(q);
  const [cityValue, setCityValue] = useState(city.length === 1 ? city[0] : '');
  useEffect(() => setText(q), [q]);
  useEffect(() => setCityValue(city.length === 1 ? city[0] : ''), [city]);

  const stats = useMemo(() => (colleges ? kpis(colleges) : null), [colleges]);
  const place = stateName ?? 'India';
  const title = stateName ? `B.Arch Colleges in ${stateName}` : 'Browse all B.Arch colleges';

  return (
    <Box component="section" aria-labelledby="dir-title" sx={{ display: 'flex', flexDirection: 'column', gap: { md: 2.25 } }}>
      {breadcrumbs && <Box sx={{ display: { xs: 'none', md: 'block' }, '& nav': { mb: 0 } }}>{breadcrumbs}</Box>}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px 32px' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: '1 1 480px', minWidth: 0 }}>
          <Typography id="dir-title" component={stateName ? 'h1' : 'h2'} sx={{ m: 0, fontSize: hubType.pageTitle, lineHeight: 1.15, fontWeight: 800, letterSpacing: '-0.02em', ...srOnlyOnPhone }}>
            {title}
          </Typography>
          <Typography sx={{ display: { xs: 'none', md: 'block' }, m: 0, fontSize: hubType.subtitle, lineHeight: 1.5, color: tokens.inkMuted, maxWidth: 720, textWrap: 'pretty' }}>
            Compare fees, cutoffs, NAAC grades and placements for all {totalCount.toLocaleString('en-IN')} B.Arch colleges in {stateName ? 'the state' : place}.
          </Typography>
        </Box>
        {stateSlug && states && states.length > 1 && (
          <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
            <Box component="label" htmlFor="state-switch" sx={{ fontSize: hubType.body, color: tokens.inkMuted }}>
              State
            </Box>
            <HubSelect id="state-switch" value={stateSlug} onChange={(e) => router.push(`/colleges/${e.target.value}`)} sx={{ minWidth: 220 }}>
              {states.map((s) => (
                <option key={s.state_slug} value={s.state_slug}>
                  {s.state} ({s.count})
                </option>
              ))}
            </HubSelect>
            <Box component={Link} href="/colleges#browse" sx={{ fontSize: hubType.body, fontWeight: 600, color: tokens.navy900, textDecoration: 'none', minHeight: 44, display: 'flex', alignItems: 'center' }}>
              All states
            </Box>
          </Box>
        )}
      </Box>

      <Box
        component="form"
        role="search"
        aria-label={`Search colleges in ${place}`}
        onSubmit={(e: React.FormEvent) => {
          e.preventDefault();
          onSearch(text, cityValue || undefined);
        }}
        sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'stretch', height: 52, bgcolor: tokens.surface, border: '1.5px solid', borderColor: tokens.lineStrong, borderRadius: 1, overflow: 'hidden', '&:focus-within': { borderColor: tokens.navy900 } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flex: '1 1 auto', minWidth: 0, px: 2, color: tokens.inkMuted }}>
          <SearchIcon aria-hidden sx={{ fontSize: 20 }} />
          <Box component="label" htmlFor="dir-q" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
            College name or city
          </Box>
          <Box
            component="input"
            id="dir-q"
            type="search"
            value={text}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
            placeholder="Search by college name or city"
            sx={{ flex: '1 1 auto', minWidth: 0, height: '100%', border: 0, outline: 'none', font: 'inherit', fontSize: 15, color: tokens.ink, bgcolor: 'transparent' }}
          />
        </Box>
        {cities.length > 1 && (
          <Box sx={{ display: 'flex', alignItems: 'center', borderLeft: '1px solid', borderColor: tokens.line, flex: '0 0 220px' }}>
            <Box component="label" htmlFor="dir-city" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
              City
            </Box>
            <HubSelect id="dir-city" variant="bare" height={49} value={cityValue} onChange={(e) => setCityValue(e.target.value)} sx={{ width: '100%' }}>
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c.city_slug} value={c.city_slug}>
                  {c.city}
                </option>
              ))}
            </HubSelect>
          </Box>
        )}
        <Box
          component="button"
          type="submit"
          sx={{ flex: '0 0 auto', minWidth: 120, border: 0, bgcolor: tokens.navy900, color: tokens.paper, font: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer', '&:hover': { bgcolor: tokens.navy900 }, '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: -4 } }}
        >
          Search
        </Box>
      </Box>

      {stats && (
        <Box
          component="dl"
          sx={{ m: 0, display: { xs: 'none', md: 'grid' }, gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`, border: '1px solid', borderColor: tokens.line, borderRadius: 1, overflow: 'hidden', bgcolor: tokens.ground }}
        >
          {stats.map((s) => (
            <Box key={s.label} sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, px: 2.25, py: 1.5, borderRight: '1px solid', borderColor: tokens.line, '&:last-of-type': { borderRight: 0 }, minWidth: 0 }}>
              <Box component="dt" sx={statLabelSx}>{s.label}</Box>
              <Box component="dd" sx={{ m: 0, fontSize: hubType.kpi, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.value}</Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
