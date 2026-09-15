'use client';

/**
 * The teacher's notes as a numbered list that matches the pins on the drawing.
 * Tapping a note lights up its pin; tapping a pin lights up its note. An older
 * note with no place on the drawing is listed without the link.
 */
import { Box, Stack, Typography } from '@neram/ui';
import type { RegionNote } from '@/lib/drawing-region-notes';

export default function WhatToFixList({
  notes,
  activeId,
  onSelect,
}: {
  notes: RegionNote[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
}) {
  if (notes.length === 0) return null;

  return (
    <Box component="section" aria-labelledby="what-to-fix-heading">
      <Typography id="what-to-fix-heading" component="h2" variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>
        What to fix
      </Typography>
      <Stack component="ol" spacing={1} sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {notes.map((note) => {
          const active = note.id === activeId;
          const linked = !!note.region;
          const content = (
            <>
              <Box
                aria-hidden
                sx={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.8125rem',
                  fontWeight: 800,
                  color: linked ? '#fff' : 'text.secondary',
                  bgcolor: linked ? (active ? '#b71c1c' : '#c62828') : 'action.selected',
                }}
              >
                {note.number}
              </Box>
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0, textAlign: 'left', lineHeight: 1.5 }}>
                {note.text}
              </Typography>
            </>
          );

          return (
            <Box component="li" key={note.id}>
              {linked ? (
                <Box
                  component="button"
                  type="button"
                  data-note-id={note.id}
                  onClick={() => onSelect(active ? null : note.id)}
                  aria-pressed={active}
                  aria-label={`Note ${note.number}: ${note.text}. Show it on your drawing`}
                  sx={{
                    width: '100%',
                    minHeight: 48,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1.25,
                    p: 1.25,
                    m: 0,
                    font: 'inherit',
                    color: 'text.primary',
                    cursor: 'pointer',
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: active ? '#c62828' : 'divider',
                    bgcolor: active ? 'rgba(198, 40, 40, 0.06)' : 'transparent',
                    transition: 'background-color 0.15s ease, border-color 0.15s ease',
                    '&:hover': { bgcolor: active ? 'rgba(198, 40, 40, 0.09)' : 'action.hover' },
                    '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                    '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                  }}
                >
                  {content}
                </Box>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, p: 1.25, borderRadius: 2, bgcolor: 'action.hover' }}>
                  {content}
                </Box>
              )}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
