'use client';

/**
 * What a student told the teacher, on their row of the Students tab.
 *
 * A compact tag ("Didn't know", "Unwell", "Asked to reopen") that opens their
 * own words underneath. Before this, a reason given through "Tell your teacher
 * why" was stored and shown nowhere a teacher chasing the class would look, and
 * a note typed on an ask to reopen read only as "asked to reopen".
 *
 * Two parts, deliberately apart. The tag lives inside the row, next to the name
 * it belongs to. The note renders BELOW the row, outside its tap target, so
 * reading it never opens the answer sheet and a long note can use the full width
 * of a phone.
 */

import { Box, Typography } from '@neram/ui';
import FeedbackOutlinedIcon from '@mui/icons-material/FeedbackOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { StudentResultRow } from './TestResultsStudents';

type ReasonRow = Pick<StudentResultRow, 'student_id' | 'student_name' | 'why' | 'request_note'>;

function formatDay(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

export default function ResultReasonToggle({
  row,
  open,
  onToggle,
}: {
  row: ReasonRow;
  open: boolean;
  onToggle: () => void;
}) {
  const tag = row.why ? row.why.short_label : 'Asked to reopen';
  const blamesPaper = row.why?.code === 'technical_problem';
  const who = row.student_name || 'This student';
  const said = row.why ? row.why.label : 'asked to reopen';

  return (
    <Box
      component="button"
      type="button"
      data-testid={`reason-toggle-${row.student_id}`}
      aria-expanded={open}
      aria-controls={`reason-${row.student_id}`}
      aria-label={`${who}: ${said}. ${open ? 'Hide' : 'Show'} what they told you`}
      // The row itself opens the answer sheet on a tap or Enter, so both stop here.
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
      sx={{
        appearance: 'none',
        border: 0,
        bgcolor: 'transparent',
        p: 0,
        m: 0,
        font: 'inherit',
        color: 'inherit',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        // The pill is small; the tap target is not.
        minHeight: 44,
        maxWidth: '100%',
        borderRadius: 999,
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
      }}
    >
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          minWidth: 0,
          px: 1,
          py: 0.25,
          borderRadius: 999,
          border: 1,
          borderColor: blamesPaper ? 'error.main' : 'divider',
          bgcolor: open ? 'action.selected' : 'background.paper',
          color: blamesPaper ? 'error.dark' : 'text.primary',
          fontSize: '0.75rem',
          fontWeight: 700,
          lineHeight: 1.6,
        }}
      >
        <FeedbackOutlinedIcon aria-hidden sx={{ fontSize: 14 }} />
        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {tag}
          {row.why && row.request_note ? ' · asked to reopen' : ''}
        </Box>
        <ExpandMoreIcon
          aria-hidden
          sx={{
            fontSize: 16,
            transform: open ? 'rotate(180deg)' : 'none',
            '@media (prefers-reduced-motion: no-preference)': { transition: 'transform 150ms ease' },
          }}
        />
      </Box>
    </Box>
  );
}

/** The student's own words, under their row. */
export function ResultReasonDetail({
  row,
  id,
  indent,
}: {
  row: ReasonRow;
  id: string;
  /** Theme spacing that lines the text up under the name from 600px up. */
  indent: number;
}) {
  const who = row.student_name || 'this student';
  return (
    <Box
      id={id}
      role="region"
      aria-label={`What ${who} told you`}
      sx={{ pl: { xs: 1.5, sm: indent }, pr: 1.5, pb: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}
    >
      {row.why && (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
            {row.why.label}
          </Typography>
          {row.why.note && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', mt: 0.25 }}
            >
              {row.why.note}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
            {row.why.for_this_run ? 'Told you' : 'Said about this paper'}
            {row.why.at ? ` on ${formatDay(row.why.at)}` : ''}
          </Typography>
        </Box>
      )}
      {row.request_note && (
        <Typography variant="body2" sx={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
          <Box component="span" sx={{ fontWeight: 600 }}>
            Asked to reopen:
          </Box>{' '}
          {row.request_note}
        </Typography>
      )}
    </Box>
  );
}
