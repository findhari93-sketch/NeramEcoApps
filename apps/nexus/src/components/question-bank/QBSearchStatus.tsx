'use client';

import { Box, Typography, Button } from '@neram/ui';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import SpellcheckOutlinedIcon from '@mui/icons-material/SpellcheckOutlined';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';

export type QBMatchKind = 'text' | 'partial' | 'fuzzy';

interface QBSearchStatusProps {
  query: string;
  matchKind: QBMatchKind | null;
  didYouMean: string | null;
  total: number;
  loading: boolean;
  /** Runs the suggested correction. */
  onUseSuggestion: (term: string) => void;
  onClear: () => void;
}

/**
 * Tells the user how their search was answered.
 *
 * The old behaviour was a silent "0 found" next to the filter chips, which is
 * the one thing the UX guidance calls out as a dead end: a student who typed
 * "lines parabo" was told nothing existed, when in fact eleven questions did.
 *
 * The engine now degrades instead of failing, so this has to say WHICH rung it
 * landed on. A broadened or corrected result set that looks identical to an
 * exact one is its own kind of lie.
 */
export default function QBSearchStatus({
  query,
  matchKind,
  didYouMean,
  total,
  loading,
  onUseSuggestion,
  onClear,
}: QBSearchStatusProps) {
  if (!query.trim() || loading) return null;

  const styles = {
    exact: { bg: 'success.50', border: 'success.200', fg: 'success.dark' },
    soft: { bg: 'warning.50', border: 'warning.200', fg: 'warning.dark' },
    none: { bg: 'grey.50', border: 'grey.300', fg: 'text.secondary' },
  };

  let tone = styles.exact;
  let icon = <SearchOutlinedIcon fontSize="small" aria-hidden="true" />;
  let message: React.ReactNode = null;

  if (total === 0) {
    tone = styles.none;
    icon = <SearchOffOutlinedIcon fontSize="small" aria-hidden="true" />;
    message = (
      <>
        Nothing matched <strong>{query}</strong>. Try fewer words, or a topic name like
        {' '}<em>parabola</em> or <em>perspective</em>.
      </>
    );
  } else if (matchKind === 'fuzzy') {
    tone = styles.soft;
    icon = <SpellcheckOutlinedIcon fontSize="small" aria-hidden="true" />;
    message = didYouMean ? (
      <>
        No exact match for <strong>{query}</strong>. Showing {total} result
        {total === 1 ? '' : 's'} for the closest spelling.
      </>
    ) : (
      <>
        No exact match for <strong>{query}</strong>. Showing {total} similar result
        {total === 1 ? '' : 's'}.
      </>
    );
  } else if (matchKind === 'partial') {
    tone = styles.soft;
    icon = <AutoAwesomeOutlinedIcon fontSize="small" aria-hidden="true" />;
    message = (
      <>
        No question matches all of <strong>{query}</strong>. Showing {total} result
        {total === 1 ? '' : 's'} matching some of it.
      </>
    );
  } else {
    return (
      // Exact matches need no explanation, but the count still has to be
      // announced for screen readers, which is why this is not simply null.
      <Box aria-live="polite" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {total} result{total === 1 ? '' : 's'} for {query}
      </Box>
    );
  }

  return (
    <Box
      aria-live="polite"
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        px: 1.5,
        py: 1.25,
        mb: 1.5,
        borderRadius: 1.5,
        bgcolor: tone.bg,
        border: '1px solid',
        borderColor: tone.border,
      }}
    >
      <Box sx={{ color: tone.fg, display: 'flex', pt: '2px' }}>{icon}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ color: 'text.primary', lineHeight: 1.5 }}>
          {message}
        </Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: didYouMean || total === 0 ? 1 : 0 }}>
          {didYouMean && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => onUseSuggestion(didYouMean)}
              sx={{
                textTransform: 'none',
                minHeight: 40, // stays a comfortable tap target on a 375px screen
                cursor: 'pointer',
              }}
            >
              Search “{didYouMean}” instead
            </Button>
          )}
          {total === 0 && (
            <Button
              size="small"
              variant="text"
              onClick={onClear}
              sx={{ textTransform: 'none', minHeight: 40, cursor: 'pointer' }}
            >
              Clear search
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
}
