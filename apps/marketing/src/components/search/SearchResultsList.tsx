'use client';

import { Box, Typography, Chip, Divider } from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import HistoryIcon from '@mui/icons-material/History';
import { getCategoryColor, CATEGORY_CONFIG, QUICK_LINKS } from '@/lib/search-index';
import { CATEGORY_LISTING_PATH, type SiteSearch } from './useSiteSearch';

interface Props {
  search: SiteSearch;
  /** id of the listbox; the input points at it with aria-controls. */
  listId: string;
  /** Taller rows for fingers (phone dialog). */
  touch?: boolean;
}

export const optionId = (listId: string, index: number) => `${listId}-opt-${index}`;

const groupLabelSx = {
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  fontSize: '0.7rem',
} as const;

/** Recent searches, quick links, the no-results hint and grouped results. */
export default function SearchResultsList({ search, listId, touch = false }: Props) {
  const { query, groupedResults, selectedIndex, recentSearches, clearRecent, setQuery, navigateTo, openCategory } = search;
  const empty = query.trim() === '';
  let flatIndex = 0;

  if (empty) {
    return (
      <Box>
        {recentSearches.length > 0 && (
          <Box sx={{ px: 2, pt: 1, pb: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography component="p" sx={{ ...groupLabelSx, m: 0, color: 'text.secondary' }}>
                Recent searches
              </Typography>
              <Box
                component="button"
                type="button"
                onClick={clearRecent}
                sx={{ minHeight: 36, px: 1, border: 0, bgcolor: 'transparent', color: 'primary.dark', font: 'inherit', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', borderRadius: 1, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}
              >
                Clear
              </Box>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {recentSearches.map((q) => (
                <Chip
                  key={q}
                  label={q}
                  size="small"
                  icon={<HistoryIcon sx={{ fontSize: '14px !important' }} />}
                  onClick={() => setQuery(q)}
                  sx={{ borderRadius: '6px', fontSize: '0.8rem', bgcolor: 'action.hover', '&:hover': { bgcolor: 'action.selected' } }}
                />
              ))}
            </Box>
            <Divider sx={{ mt: 1.5 }} />
          </Box>
        )}
        <Box sx={{ px: 2, pt: 1.5 }}>
          <Typography component="p" sx={{ ...groupLabelSx, m: 0, mb: 1, color: 'text.secondary' }}>
            Quick links
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1 }}>
            {QUICK_LINKS.map((entry) => {
              const color = getCategoryColor(entry.category);
              return (
                <Box
                  key={entry.path}
                  component="a"
                  href={entry.path}
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    navigateTo(entry.path, entry);
                  }}
                  sx={{
                    display: 'block',
                    p: 1.5,
                    borderRadius: 2,
                    textDecoration: 'none',
                    border: '1px solid',
                    borderColor: 'divider',
                    transition: 'background-color 0.15s, border-color 0.15s',
                    '&:hover': { bgcolor: `${color}0a`, borderColor: `${color}50` },
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
                  }}
                >
                  <Typography component="span" sx={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, mb: 0.25, color }}>
                    {entry.title}
                  </Typography>
                  <Typography component="span" sx={{ display: 'block', fontSize: '0.75rem', lineHeight: 1.35, color: 'text.secondary' }}>
                    {entry.description.length > 50 ? `${entry.description.slice(0, 50)}...` : entry.description}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>
    );
  }

  if (groupedResults.length === 0) {
    return (
      <Box sx={{ px: 3, py: 4, textAlign: 'center' }}>
        <SearchIcon aria-hidden sx={{ fontSize: 36, color: 'text.disabled', mb: 1 }} />
        <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary', mb: 0.5 }}>No results for &ldquo;{query}&rdquo;</Typography>
        <Typography sx={{ display: 'block', fontSize: '0.8rem', color: 'text.secondary', mb: 2 }}>
          Try different keywords or reach us at +91 91761 37043
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, justifyContent: 'center' }}>
          {['NATA 2026', 'Fees', 'Colleges', 'Apply Now', 'Free Tools'].map((s) => (
            <Chip key={s} label={s} size="small" onClick={() => setQuery(s)} sx={{ borderRadius: '6px', fontSize: '0.8rem', bgcolor: 'action.hover', '&:hover': { bgcolor: 'action.selected' } }} />
          ))}
        </Box>
      </Box>
    );
  }

  return (
    <Box id={listId} role="listbox" aria-label="Search results">
      {groupedResults.map((group) => {
        const config = CATEGORY_CONFIG[group.category];
        const overflow = group.totalCount - group.results.length;
        const hasListing = group.category === 'college' || Boolean(CATEGORY_LISTING_PATH[group.category]);
        const start = flatIndex;
        flatIndex += group.results.length;
        return (
          <Box key={group.category} role="group" aria-label={config.label} sx={{ mt: 0.5 }}>
            <Box sx={{ px: 2, minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography component="span" sx={{ ...groupLabelSx, color: config.color }}>
                {config.label}
              </Typography>
              {overflow > 0 && hasListing && (
                <Box
                  component="button"
                  type="button"
                  tabIndex={-1}
                  onClick={() => openCategory(group.category)}
                  sx={{ minHeight: 32, px: 1, border: 0, bgcolor: 'transparent', color: config.color, font: 'inherit', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                >
                  {group.category === 'college' ? `See all ${group.totalCount} results` : `+${overflow} more`}
                </Box>
              )}
            </Box>
            {group.results.map((result, i) => {
              const index = start + i;
              const selected = index === selectedIndex;
              return (
                <Box
                  key={result.path}
                  id={optionId(listId, index)}
                  role="option"
                  aria-selected={selected}
                  onClick={() => navigateTo(result.path, result)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 2,
                    py: 1,
                    mx: 1,
                    borderRadius: 2,
                    cursor: 'pointer',
                    bgcolor: selected ? 'action.hover' : 'transparent',
                    '&:hover': { bgcolor: 'action.hover' },
                    transition: 'background-color 0.15s',
                    minHeight: touch ? 64 : 48,
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography component="span" sx={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, mb: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {result.title}
                    </Typography>
                    <Typography component="span" sx={{ display: 'block', fontSize: '0.78rem', lineHeight: 1.4, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {result.description}
                    </Typography>
                  </Box>
                  <ArrowForwardIcon aria-hidden sx={{ fontSize: 15, color: config.color, flexShrink: 0, opacity: selected ? 1 : 0, transition: 'opacity 0.15s' }} />
                </Box>
              );
            })}
          </Box>
        );
      })}
    </Box>
  );
}
