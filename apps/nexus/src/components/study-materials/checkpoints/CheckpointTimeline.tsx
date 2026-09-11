'use client';

/**
 * The recording as one strip: where each checkpoint sits, the stretches no
 * checkpoint covers, where two overlap, and where the video is now.
 *
 * A picture of what the four number boxes of every card used to leave the
 * teacher to imagine. Each checkpoint is a button that opens it; gaps are
 * striped amber and overlaps red, and both are also listed in words above the
 * editor, so colour is never the only signal.
 */

import { Box, Typography, alpha } from '@neram/ui';
import { timelineSegments } from '@/lib/checkpoint-validation';
import { formatTimecode } from '@/lib/timecode';
import type { DraftSection } from '@/lib/checkpoint-draft';

export interface CheckpointTimelineProps {
  sections: DraftSection[];
  selectedKey: string | null;
  durationSeconds: number | null;
  currentSeconds: number;
  onSelect: (key: string) => void;
}

export default function CheckpointTimeline({
  sections,
  selectedKey,
  durationSeconds,
  currentSeconds,
  onSelect,
}: CheckpointTimelineProps) {
  const lastEnd = sections.reduce((max, s) => Math.max(max, Number(s.end_timestamp_seconds) || 0), 0);
  const length = durationSeconds && durationSeconds > 0 ? durationSeconds : Math.max(60, lastEnd);
  const segments = timelineSegments(sections, length);
  const pct = (seconds: number) => `${Math.max(0, Math.min(100, (seconds / length) * 100))}%`;

  return (
    <Box>
      <Box
        role="group"
        aria-label="Checkpoints along the video"
        sx={{
          position: 'relative',
          height: 44,
          borderRadius: 1.5,
          bgcolor: (theme) => alpha(theme.palette.text.primary, 0.06),
          overflow: 'hidden',
        }}
      >
        {segments.map((segment, i) => {
          if (segment.kind === 'checkpoint') {
            const section = sections[segment.sectionIndex];
            const number = segment.sectionIndex + 1;
            const selected = section.key === selectedKey;
            return (
              <Box
                key={`checkpoint-${section.key}`}
                component="button"
                type="button"
                onClick={() => onSelect(section.key)}
                aria-label={`Checkpoint ${number}, ${formatTimecode(segment.start)} to ${formatTimecode(segment.end)}`}
                aria-pressed={selected}
                sx={{
                  position: 'absolute',
                  top: 4,
                  bottom: 4,
                  left: pct(segment.start),
                  width: `max(6px, calc(${pct(segment.end - segment.start)} - 2px))`,
                  border: 0,
                  borderRadius: 1,
                  p: 0,
                  cursor: 'pointer',
                  overflow: 'hidden',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  color: selected ? 'primary.contrastText' : 'primary.dark',
                  bgcolor: (theme) => (selected ? theme.palette.primary.main : alpha(theme.palette.primary.main, 0.25)),
                  transition: 'background-color 150ms',
                  '&:hover': { bgcolor: (theme) => (selected ? theme.palette.primary.dark : alpha(theme.palette.primary.main, 0.4)) },
                  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.dark', outlineOffset: 1 },
                }}
              >
                {number}
              </Box>
            );
          }
          return (
            <Box
              key={`${segment.kind}-${i}`}
              aria-hidden
              sx={{
                position: 'absolute',
                top: segment.kind === 'overlap' ? 0 : 14,
                bottom: segment.kind === 'overlap' ? 0 : 14,
                left: pct(segment.start),
                width: pct(segment.end - segment.start),
                pointerEvents: 'none',
                bgcolor: (theme) => (segment.kind === 'overlap' ? alpha(theme.palette.error.main, 0.45) : 'transparent'),
                backgroundImage:
                  segment.kind === 'gap'
                    ? 'repeating-linear-gradient(45deg, rgba(237,108,2,0.6) 0 4px, transparent 4px 8px)'
                    : undefined,
              }}
            />
          );
        })}
        {currentSeconds > 0 && (
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: pct(currentSeconds),
              width: 2,
              bgcolor: 'error.main',
              pointerEvents: 'none',
            }}
          />
        )}
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          0:00
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatTimecode(length)}
        </Typography>
      </Box>
    </Box>
  );
}
