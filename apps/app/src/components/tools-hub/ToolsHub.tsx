'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Box, Typography, TextField, InputAdornment, IconButton, Button } from '@neram/ui';
import { alpha } from '@mui/material/styles';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { neramTokens as t } from '@neram/ui';
import {
  TOOL_CATALOG,
  TOOL_STAGES,
  TOOL_TRACKS,
  trackLabel,
  type ToolDef,
  type ToolTrack,
} from '@/lib/navigation-data';
import { getRecentToolIds } from '@/lib/recent-tools';
import ToolTile from './ToolTile';

type TrackFilter = ToolTrack | 'all';

function matches(tool: ToolDef, query: string): boolean {
  if (!query) return true;
  const haystack = [tool.title, tool.shortTitle, tool.description, trackLabel(tool.track), ...(tool.keywords ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/** Available tools first, coming-soon tools last, catalog order otherwise. */
function availableFirst(a: ToolDef, b: ToolDef): number {
  return Number(!!a.comingSoon) - Number(!!b.comingSoon);
}

export default function ToolsHub() {
  const [query, setQuery] = useState('');
  const [track, setTrack] = useState<TrackFilter>('all');
  const [recentIds, setRecentIds] = useState<string[]>([]);

  // localStorage is read after mount so the server and first client render match.
  useEffect(() => {
    setRecentIds(getRecentToolIds());
  }, []);

  const trimmed = query.trim();
  const filtering = trimmed.length > 0 || track !== 'all';

  const visible = useMemo(
    () => TOOL_CATALOG.filter((tool) => (track === 'all' || tool.track === track) && matches(tool, trimmed)),
    [track, trimmed],
  );

  const recent = useMemo(
    () =>
      recentIds
        .map((id) => TOOL_CATALOG.find((tool) => tool.id === id))
        .filter((tool): tool is ToolDef => !!tool && !tool.comingSoon)
        .slice(0, 4),
    [recentIds],
  );

  const popular = TOOL_CATALOG.filter((tool) => tool.popular && !tool.comingSoon);
  const availableCount = TOOL_CATALOG.filter((tool) => !tool.comingSoon).length;

  const clearAll = () => {
    setQuery('');
    setTrack('all');
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: { xs: 2.5, md: 3 } }}>
        <Typography variant="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.125rem' }, mb: 0.75 }}>
          Tools
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: { xs: '1rem', md: '1.0625rem' }, maxWidth: 640 }}>
          Plan your exam, know your score and choose your college. {availableCount} free tools built on real
          admission data.
        </Typography>
      </Box>

      {/* Search and exam filter */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { md: 'center' },
          gap: 1.5,
          mb: { xs: 3, md: 4 },
        }}
      >
        <TextField
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tools, like cutoff or JoSAA"
          inputProps={{ 'aria-label': 'Search tools', enterKeyHint: 'search' }}
          sx={{ flex: { md: '0 1 420px' }, '& .MuiOutlinedInput-root': { minHeight: 48 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRoundedIcon sx={{ color: 'text.secondary' }} />
              </InputAdornment>
            ),
            endAdornment: query ? (
              <InputAdornment position="end">
                <IconButton aria-label="Clear search" onClick={() => setQuery('')} edge="end" sx={{ width: 40, height: 40 }}>
                  <CloseRoundedIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          }}
        />

        <Box
          role="group"
          aria-label="Filter by exam"
          sx={{
            display: 'flex',
            gap: 1,
            overflowX: 'auto',
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
            mx: { xs: -2, sm: 0 },
            px: { xs: 2, sm: 0 },
          }}
        >
          {([{ id: 'all', label: 'All exams' }, ...TOOL_TRACKS] as { id: TrackFilter; label: string }[]).map(
            ({ id, label }) => {
              const selected = track === id;
              return (
                <Box
                  key={id}
                  component="button"
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setTrack(id)}
                  sx={{
                    flexShrink: 0,
                    minHeight: 44,
                    px: 2,
                    borderRadius: 999,
                    border: '1px solid',
                    borderColor: selected ? 'primary.main' : 'divider',
                    bgcolor: (theme) => (selected ? alpha(theme.palette.primary.main, 0.1) : 'background.paper'),
                    color: selected ? 'primary.main' : 'text.primary',
                    font: 'inherit',
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'border-color 0.15s ease, background-color 0.15s ease',
                    '&:hover': { borderColor: 'primary.main' },
                  }}
                >
                  {label}
                </Box>
              );
            },
          )}
        </Box>
      </Box>

      {!filtering && (
        <>
          {recent.length > 0 && (
            <Box component="section" aria-labelledby="recent-heading" sx={{ mb: { xs: 3, md: 4 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
                <HistoryRoundedIcon sx={{ fontSize: 18, color: 'text.secondary' }} aria-hidden="true" />
                <Typography id="recent-heading" component="h2" sx={{ fontSize: '0.875rem', fontWeight: 700, color: 'text.secondary' }}>
                  Pick up where you left off
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {recent.map((tool) => (
                  <Box
                    key={tool.id}
                    component={Link}
                    href={tool.href}
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 1,
                      minHeight: 44,
                      pl: 1.25,
                      pr: 1.75,
                      borderRadius: 999,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: 'background.paper',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: 'text.primary',
                      '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
                    }}
                  >
                    <tool.Icon sx={{ fontSize: 18, color: 'primary.main' }} aria-hidden="true" />
                    {tool.shortTitle ?? tool.title}
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          <PopularBand tools={popular} />
        </>
      )}

      {/* Results */}
      {visible.length === 0 ? (
        <Box
          role="status"
          sx={{
            textAlign: 'center',
            py: 6,
            px: 3,
            borderRadius: 4,
            border: '1px dashed',
            borderColor: 'divider',
          }}
        >
          <SearchRoundedIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} aria-hidden="true" />
          <Typography sx={{ fontWeight: 700, mb: 0.5 }}>
            {trimmed ? `No tools match "${trimmed}"` : 'No tools here yet'}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem', mb: 2 }}>
            Try a shorter word, or look across every exam.
          </Typography>
          <Button variant="outlined" onClick={clearAll}>
            Show all tools
          </Button>
        </Box>
      ) : (
        <>
          {filtering && (
            <Typography role="status" sx={{ color: 'text.secondary', fontSize: '0.875rem', mb: 2 }}>
              {visible.length} {visible.length === 1 ? 'tool' : 'tools'}
              {track !== 'all' ? ` for ${trackLabel(track)}` : ''}
              {trimmed ? ` matching "${trimmed}"` : ''}
            </Typography>
          )}
          {TOOL_STAGES.map((stage) => {
            const tools = visible.filter((tool) => tool.stage === stage.id).sort(availableFirst);
            if (tools.length === 0) return null;
            const headingId = `stage-${stage.id}`;
            return (
              <Box key={stage.id} component="section" aria-labelledby={headingId} sx={{ mb: { xs: 4, md: 5 } }}>
                <Box sx={{ mb: 1.75 }}>
                  <Typography id={headingId} component="h2" sx={{ fontSize: { xs: '1.125rem', md: '1.25rem' }, fontWeight: 700 }}>
                    {stage.title}
                  </Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem', mt: 0.25 }}>
                    {stage.description}
                  </Typography>
                </Box>
                <Box
                  component="ul"
                  sx={{
                    listStyle: 'none',
                    m: 0,
                    p: 0,
                    display: 'grid',
                    gap: 1.5,
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
                  }}
                >
                  {tools.map((tool) => (
                    <li key={tool.id}>
                      <ToolTile tool={tool} showTrack={track === 'all'} />
                    </li>
                  ))}
                </Box>
              </Box>
            );
          })}
        </>
      )}

      <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem', lineHeight: 1.6, maxWidth: 720, mt: 1 }}>
        Predictions use previous years&apos; admission data and official sources. Actual cutoffs and allotments can change
        each year, so use these results as a guide, not a guarantee.
      </Typography>
    </Box>
  );
}

/**
 * The three tools students open most, on the brand navy band. Navy is used in
 * both light and dark mode so the brand reads the same everywhere.
 */
function PopularBand({ tools }: { tools: ToolDef[] }) {
  if (tools.length === 0) return null;
  return (
    <Box
      component="section"
      aria-labelledby="popular-heading"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        mb: { xs: 4, md: 5 },
        p: { xs: 2, sm: 3 },
        borderRadius: 4,
        color: t.cream[100],
        bgcolor: t.navy[900],
        backgroundImage: `linear-gradient(${alpha(t.blue[400], 0.07)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(t.blue[400], 0.07)} 1px, transparent 1px), radial-gradient(120% 140% at 100% 0%, ${alpha(t.blue[500], 0.35)} 0%, transparent 55%)`,
        backgroundSize: '24px 24px, 24px 24px, 100% 100%',
      }}
    >
      <Typography
        component="p"
        sx={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.gold[400], mb: 0.5 }}
      >
        Most used
      </Typography>
      <Typography id="popular-heading" component="h2" sx={{ fontSize: { xs: '1.25rem', md: '1.5rem' }, fontWeight: 700, color: '#FFFFFF', mb: 2 }}>
        Where most students start
      </Typography>
      <Box
        component="ul"
        sx={{
          listStyle: 'none',
          m: 0,
          p: 0,
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: { xs: '1fr', md: `repeat(${Math.min(tools.length, 3)}, minmax(0, 1fr))` },
        }}
      >
        {tools.map((tool) => (
          <li key={tool.id}>
            <Box
              component={Link}
              href={tool.href}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                height: '100%',
                minHeight: 72,
                p: 1.75,
                borderRadius: 3,
                border: `1px solid ${alpha('#FFFFFF', 0.12)}`,
                bgcolor: alpha('#FFFFFF', 0.06),
                color: 'inherit',
                transition: 'background-color 0.2s ease, border-color 0.2s ease',
                '&:hover': { bgcolor: alpha('#FFFFFF', 0.1), borderColor: alpha(t.gold[400], 0.6) },
                '&:hover .band-arrow': { transform: 'translateX(3px)' },
                '&:focus-visible': { outline: `2px solid ${t.gold[400]}`, outlineOffset: 2 },
              }}
            >
              <Box
                aria-hidden="true"
                sx={{
                  width: 44,
                  height: 44,
                  flexShrink: 0,
                  borderRadius: 2.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: alpha(t.gold[500], 0.16),
                  color: t.gold[400],
                }}
              >
                <tool.Icon sx={{ fontSize: 24 }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography component="h3" sx={{ fontSize: '1rem', fontWeight: 700, color: '#FFFFFF', lineHeight: 1.3 }}>
                  {tool.title}
                </Typography>
                <Typography sx={{ fontSize: '0.8125rem', color: alpha(t.cream[100], 0.78), lineHeight: 1.45, mt: 0.25 }}>
                  {trackLabel(tool.track)}
                </Typography>
              </Box>
              <ArrowForwardRoundedIcon className="band-arrow" sx={{ fontSize: 20, color: t.gold[400], transition: 'transform 0.2s ease' }} aria-hidden="true" />
            </Box>
          </li>
        ))}
      </Box>
    </Box>
  );
}
