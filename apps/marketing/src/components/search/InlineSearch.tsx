'use client';

import { useEffect, useRef } from 'react';
import { Box, Paper } from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { useSiteSearch } from './useSiteSearch';
import SearchResultsList, { optionId } from './SearchResultsList';

interface Props {
  /** `restoreFocus` is true when the user dismissed it (Escape or X), so the trigger gets focus back. */
  onClose: (restoreFocus: boolean) => void;
}

const LIST_ID = 'header-search-results';

/** Laptop search: the field takes the nav's place in the header and results drop below it. */
export default function InlineSearch({ onClose }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useSiteSearch(() => onClose(false));
  const { query, setQuery, flatResults, selectedIndex, handleKeyDown, reset } = search;

  useEffect(() => {
    reset();
    inputRef.current?.focus();
  }, [reset]);

  // Clicking anywhere else puts the header back the way it was.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [onClose]);

  return (
    <Box
      ref={rootRef}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose(true);
        }
      }}
      sx={{
        position: 'relative',
        flex: '1 1 auto',
        minWidth: 0,
        maxWidth: 720,
        mx: 'auto',
        animation: 'inlineSearchIn 180ms ease-out',
        '@keyframes inlineSearchIn': { from: { opacity: 0, transform: 'scaleX(0.96)' }, to: { opacity: 1, transform: 'none' } },
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }}
    >
      <Box
        component="form"
        role="search"
        onSubmit={(e: React.FormEvent) => {
          e.preventDefault();
          const hit = flatResults[selectedIndex];
          if (hit) search.navigateTo(hit.path, hit);
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          height: 44,
          pl: 1.75,
          pr: 0.25,
          border: '1.5px solid',
          borderColor: 'primary.main',
          borderRadius: 22,
          bgcolor: 'background.paper',
          boxShadow: (t) => `0 0 0 3px ${t.palette.primary.main}22`,
        }}
      >
        <SearchIcon aria-hidden sx={{ fontSize: 20, color: 'text.secondary' }} />
        <Box
          component="input"
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search colleges, exams, courses, tools"
          autoComplete="off"
          role="combobox"
          aria-label="Search the site"
          aria-expanded={flatResults.length > 0}
          aria-controls={LIST_ID}
          aria-autocomplete="list"
          aria-activedescendant={flatResults.length ? optionId(LIST_ID, selectedIndex) : undefined}
          sx={{
            flex: '1 1 auto',
            minWidth: 0,
            height: '100%',
            border: 0,
            outline: 'none',
            bgcolor: 'transparent',
            font: 'inherit',
            fontSize: 15,
            color: 'text.primary',
            '&::-webkit-search-cancel-button': { display: 'none' },
          }}
        />
        <Box
          component="button"
          type="button"
          onClick={() => onClose(true)}
          aria-label="Close search"
          sx={{
            width: 40,
            height: 40,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 0,
            borderRadius: '50%',
            bgcolor: 'transparent',
            color: 'text.secondary',
            cursor: 'pointer',
            '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
            '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
          }}
        >
          <CloseIcon sx={{ fontSize: 20 }} />
        </Box>
      </Box>
      <Paper
        elevation={8}
        sx={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          left: 0,
          right: 0,
          maxHeight: 'min(70vh, 560px)',
          overflowY: 'auto',
          borderRadius: 2,
          py: 1,
        }}
      >
        <SearchResultsList search={search} listId={LIST_ID} />
      </Paper>
    </Box>
  );
}
