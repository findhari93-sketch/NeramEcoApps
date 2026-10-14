'use client';

import { Box, Typography } from '@mui/material';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import type { ListingCollege } from '@/lib/college-hub/listing-filter';
import { shortName } from '@/lib/college-hub/format';
import { useCompareList } from '@/lib/college-hub/compare-store';
import type { ViewMode } from '../view-mode';
import CollegeResultCard from './CollegeResultCard';
import CollegeGridTile from './CollegeGridTile';
import CollegeTable from './CollegeTable';
import MobileCollegeRow from './MobileCollegeRow';
import type { SortKey } from './filter-model';

interface Props {
  colleges: ListingCollege[];
  view: ViewMode;
  /** Position of the first college (pagination). */
  startRank: number;
  sort: SortKey;
  onSort: (sort: SortKey) => void;
}

/** The result list in the chosen view; phones always get compact rows. */
export default function DirectoryResults({ colleges, view, startRank, sort, onSort }: Props) {
  const compare = useCompareList();
  const toggle = (c: ListingCollege) =>
    compare.toggle({ slug: c.slug, name: c.name, shortName: shortName(c), stateSlug: c.state_slug });

  return (
    <>
      {/* Phone */}
      <Box component="ol" aria-label="Colleges" sx={{ display: { xs: 'block', md: 'none' }, listStyle: 'none', m: 0, mx: -2, p: 0, borderTop: '1px solid', borderColor: 'divider' }}>
        {colleges.map((c) => (
          <MobileCollegeRow key={c.id} college={c} inCompare={compare.has(c.slug)} onToggleCompare={() => toggle(c)} />
        ))}
      </Box>

      {/* Tablet and desktop */}
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        {view === 'list' && (
          <Box component="ol" aria-label="Colleges" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {colleges.map((c, i) => (
              <li key={c.id}>
                <CollegeResultCard college={c} rank={startRank + i} inCompare={compare.has(c.slug)} onToggleCompare={() => toggle(c)} />
              </li>
            ))}
          </Box>
        )}
        {view === 'grid' && (
          <Box component="ol" aria-label="Colleges" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))', gap: 2, alignItems: 'stretch' }}>
            {colleges.map((c, i) => (
              // Plain grid items: every tile takes its track's full width and the row's height.
              <Box component="li" key={c.id} sx={{ minWidth: 0 }}>
                <CollegeGridTile college={c} rank={startRank + i} inCompare={compare.has(c.slug)} onToggleCompare={() => toggle(c)} />
              </Box>
            ))}
          </Box>
        )}
        {view === 'table' && (
          <CollegeTable colleges={colleges} startRank={startRank} sort={sort} onSort={onSort} isInCompare={compare.has} onToggleCompare={toggle} />
        )}
      </Box>
    </>
  );
}

/** "No colleges match these filters" (copy guide), or the search-miss variant. */
export function DirectoryEmpty({ query, onClear, allStatesHref }: { query?: string; onClear: () => void; allStatesHref?: string }) {
  const searchMiss = Boolean(query?.trim());
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, p: { xs: 2.5, md: 3.5 }, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <SearchOffIcon aria-hidden sx={{ fontSize: 32, color: 'text.secondary' }} />
      <Typography component="p" sx={{ m: 0, fontSize: '1.1rem', fontWeight: 700 }}>
        {searchMiss ? `No college named "${query!.trim()}"` : 'No colleges match these filters'}
      </Typography>
      <Typography sx={{ m: 0, fontSize: '0.95rem', color: 'text.secondary' }}>
        {searchMiss ? 'Check the spelling, or search all states.' : 'Try removing a filter or widening the fee range.'}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
        <Box
          component="button"
          type="button"
          onClick={onClear}
          sx={{ minHeight: 44, px: 2, border: '1px solid', borderColor: 'primary.main', borderRadius: 1.5, bgcolor: 'background.paper', color: 'primary.dark', font: 'inherit', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}
        >
          Clear all filters
        </Box>
        {searchMiss && allStatesHref && (
          <Box
            component="a"
            href={`${allStatesHref}?q=${encodeURIComponent(query!.trim())}#browse`}
            sx={{ minHeight: 44, display: 'flex', alignItems: 'center', px: 2, borderRadius: 1.5, color: 'primary.dark', fontSize: '0.9rem', fontWeight: 700, textDecoration: 'none', '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}
          >
            Search all states
          </Box>
        )}
      </Box>
    </Box>
  );
}
