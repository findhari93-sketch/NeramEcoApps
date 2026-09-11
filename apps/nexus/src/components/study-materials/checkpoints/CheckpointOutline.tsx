'use client';

/**
 * Every checkpoint as one line: number, title, when it runs, how many questions,
 * and whether anything on it needs fixing. Pressing a line opens it.
 *
 * A column beside the player from 900px; a row that scrolls sideways on a phone,
 * so ten checkpoints do not push the editor below the fold.
 */

import { Box, Button, Typography, alpha } from '@neram/ui';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import { formatTimecode } from '@/lib/timecode';
import type { DraftSection } from '@/lib/checkpoint-draft';

export interface CheckpointOutlineProps {
  sections: DraftSection[];
  selectedKey: string | null;
  issuesBySection: Map<number, { errors: number; warnings: number }>;
  onSelect: (key: string) => void;
  onAdd: () => void;
  disabled?: boolean;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function CheckpointOutline({
  sections,
  selectedKey,
  issuesBySection,
  onSelect,
  onAdd,
  disabled = false,
}: CheckpointOutlineProps) {
  return (
    <Box>
      <Box
        component="ul"
        aria-label="Checkpoints"
        sx={{
          listStyle: 'none',
          m: 0,
          p: 0,
          display: 'flex',
          flexDirection: { xs: 'row', md: 'column' },
          gap: 1,
          overflowX: { xs: 'auto', md: 'visible' },
          pb: { xs: 0.5, md: 0 },
          scrollSnapType: { xs: 'x proximity', md: 'none' },
        }}
      >
        {sections.map((section, i) => {
          const selected = section.key === selectedKey;
          const issue = issuesBySection.get(i);
          return (
            <Box component="li" key={section.key} sx={{ flexShrink: 0, scrollSnapAlign: 'start', width: { xs: 220, md: 'auto' } }}>
              <Box
                component="button"
                type="button"
                onClick={() => onSelect(section.key)}
                aria-current={selected ? 'true' : undefined}
                sx={{
                  width: '100%',
                  minHeight: 56,
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  px: 1.5,
                  py: 1,
                  borderRadius: 2,
                  border: 1,
                  borderColor: selected ? 'primary.main' : 'divider',
                  bgcolor: (theme) => (selected ? alpha(theme.palette.primary.main, 0.08) : theme.palette.background.paper),
                  cursor: 'pointer',
                  font: 'inherit',
                  color: 'inherit',
                  transition: 'background-color 150ms, border-color 150ms',
                  '&:hover': { borderColor: 'primary.light' },
                  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                }}
              >
                <Box
                  aria-hidden
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    fontWeight: 700,
                    fontSize: '0.8125rem',
                    bgcolor: (theme) => (selected ? theme.palette.primary.main : alpha(theme.palette.text.primary, 0.08)),
                    color: selected ? 'primary.contrastText' : 'text.primary',
                  }}
                >
                  {i + 1}
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem' }} noWrap>
                    {section.title.trim() || `Checkpoint ${i + 1}`}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {formatTimecode(section.start_timestamp_seconds)} to {formatTimecode(section.end_timestamp_seconds)} ·{' '}
                    {plural(section.questions.length, 'question')}
                  </Typography>
                </Box>
                {issue?.errors ? (
                  <ErrorOutlineRoundedIcon titleAccess={`${plural(issue.errors, 'thing')} to fix`} sx={{ color: 'error.main', flexShrink: 0 }} />
                ) : issue?.warnings ? (
                  <ReportProblemOutlinedIcon titleAccess="Worth a look" sx={{ color: 'warning.main', flexShrink: 0 }} />
                ) : null}
              </Box>
            </Box>
          );
        })}
      </Box>
      <Button
        startIcon={<AddRoundedIcon />}
        onClick={onAdd}
        disabled={disabled}
        sx={{ mt: 1, minHeight: 44, textTransform: 'none' }}
      >
        Add checkpoint
      </Button>
    </Box>
  );
}
