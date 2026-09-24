'use client';

/**
 * Find one student without scrolling past ninety-nine others.
 *
 * The tab had no search, no filter and no sort, which is survivable at eight
 * students and useless at a hundred. This is the same sticky pattern the
 * Students screen already uses (search over segment pills), so the two teacher
 * lists behave the same way.
 *
 * Everything here filters the payload that is already in memory. No requests, no
 * function invocations, no debounce needed.
 */
import type { ReactNode } from 'react';
import { Box, Chip, IconButton, InputAdornment, TextField, alpha, useTheme } from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { BUCKET_META, BUCKET_ORDER, type BucketTally, type CatchupBucket } from '@/lib/catchup-buckets';

export interface CatchupFilterBarProps {
  query: string;
  onQuery: (next: string) => void;
  /** Null means "All". */
  bucket: CatchupBucket | null;
  onBucket: (next: CatchupBucket | null) => void;
  tally: BucketTally;
  total: number;
  /** A control that shares the search row (the Stage filter). */
  trailing?: ReactNode;
}

export default function CatchupFilterBar({
  query,
  onQuery,
  bucket,
  onBucket,
  tally,
  total,
  trailing,
}: CatchupFilterBarProps) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 5,
        pt: 0.5,
        pb: 1,
        mb: 1.5,
        bgcolor: (t) => (t.palette.mode === 'light' ? '#FAFAFA' : t.palette.background.default),
      }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 1 }}>
      <TextField
        size="small"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Search students"
        inputProps={{ 'aria-label': 'Search students' }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" sx={{ color: 'text.disabled' }} />
            </InputAdornment>
          ),
          endAdornment: query ? (
            <InputAdornment position="end">
              <IconButton
                size="small"
                aria-label="Clear the search"
                onClick={() => onQuery('')}
                sx={{ width: 40, height: 40 }}
              >
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : null,
        }}
        sx={{
          flex: '1 1 180px',
          minWidth: 0,
          '& .MuiOutlinedInput-root': { borderRadius: 2.5, bgcolor: 'background.paper', minHeight: 48 },
        }}
      />
      {trailing}
      </Box>

      {/* Horizontally scrollable rather than wrapping: five pills that wrap to a
          second line push the first student off a 375px screen. */}
      <Box
        role="group"
        aria-label="Filter by what is holding the student up"
        sx={{
          display: 'flex',
          gap: 1,
          overflowX: 'auto',
          pb: 0.5,
          overscrollBehaviorX: 'contain',
          '&::-webkit-scrollbar': { display: 'none' },
          scrollbarWidth: 'none',
          // The last pill fades out at the edge on a phone, which is what says
          // "there are more this way" once the scrollbar is hidden.
          [theme.breakpoints.down('sm')]: {
            mx: -2,
            px: 2,
            maskImage: 'linear-gradient(to right, #000 calc(100% - 32px), transparent)',
            WebkitMaskImage: 'linear-gradient(to right, #000 calc(100% - 32px), transparent)',
          },
        }}
      >
        <Chip
          label={`All ${total}`}
          size="small"
          variant={bucket === null ? 'filled' : 'outlined'}
          color={bucket === null ? 'primary' : 'default'}
          onClick={() => onBucket(null)}
          sx={{ height: 44, borderRadius: 22, px: 0.5, flexShrink: 0, fontWeight: 700 }}
        />
        {BUCKET_ORDER.filter((b) => tally[b] > 0).map((b) => {
          const meta = BUCKET_META[b];
          const active = bucket === b;
          const tint =
            meta.tone === 'bad'
              ? theme.palette.error.main
              : meta.tone === 'warn'
                ? theme.palette.warning.dark
                : theme.palette.text.secondary;
          return (
            <Chip
              key={b}
              label={`${meta.label} ${tally[b]}`}
              size="small"
              variant={active ? 'filled' : 'outlined'}
              onClick={() => onBucket(active ? null : b)}
              // Explicit colours rather than <Chip color>: the MuiChip overrides
              // in the shared theme resolve against the base palette, not the
              // Nexus one, so a `color` prop renders the wrong tint here.
              sx={{
                height: 44,
                borderRadius: 22,
                px: 0.5,
                flexShrink: 0,
                fontWeight: 700,
                color: active ? theme.palette.getContrastText(tint) : tint,
                bgcolor: active ? tint : alpha(tint, 0.08),
                borderColor: alpha(tint, 0.4),
                '&:hover': { bgcolor: active ? tint : alpha(tint, 0.16) },
              }}
            />
          );
        })}
      </Box>
    </Box>
  );
}
