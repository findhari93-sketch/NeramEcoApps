'use client';

/**
 * Where this attempt stands, at the top of the panel: waiting, being updated,
 * reviewed, or sent back for a redo, with the grade kept small. The detailed
 * scores come after the teacher's words, not before them.
 */
import { Box, Button, Chip, Stack, Typography, alpha } from '@neram/ui';
import HourglassEmptyRoundedIcon from '@mui/icons-material/HourglassEmptyRounded';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import type { GalleryReactionType } from '@neram/database/types';
import GradeDisplay from '../GradeDisplay';
import ReactionAppreciation from '../ReactionAppreciation';
import { STATUS_META } from '@/lib/drawing-student-status';
import type { RailMode } from '@/lib/drawing-workspace-state';
import type { StudentDrawingAttempt } from './types';

const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null;

export default function VerdictCard({
  attempt,
  mode,
  evaluationType,
  maxMarks,
  attemptIndex,
  attemptCount,
  canReplace = false,
  onSeeLatest,
}: {
  attempt: StudentDrawingAttempt;
  mode: Exclude<RailMode, 'not_submitted'>;
  evaluationType: 'marks' | 'stars';
  maxMarks: number;
  attemptIndex: number;
  attemptCount: number;
  /** The newest drawing can still be swapped, because nobody has reviewed it. */
  canReplace?: boolean;
  onSeeLatest: () => void;
}) {
  const isOld = attemptIndex < attemptCount;
  const grade = evaluationType === 'marks' ? attempt.tutor_marks : attempt.tutor_rating;
  const meta =
    mode === 'awaiting' || mode === 'updating'
      ? { label: mode === 'updating' ? 'Review being updated' : 'Waiting for review', color: '#1565C0' }
      : STATUS_META[attempt.status] ?? STATUS_META.reviewed;

  return (
    <Stack spacing={1.5}>
      {isOld && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            p: 1.25,
            pl: 1.5,
            borderRadius: 2,
            bgcolor: 'action.hover',
          }}
        >
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
            This is attempt {attemptIndex}. You have a newer one.
          </Typography>
          <Button onClick={onSeeLatest} sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700, flexShrink: 0 }}>
            See latest
          </Button>
        </Box>
      )}

      <Box>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip
            size="small"
            label={meta.label}
            sx={{ fontWeight: 700, bgcolor: alpha(meta.color, 0.12), color: meta.color }}
          />
          {mode !== 'awaiting' && mode !== 'updating' && grade != null && (
            <GradeDisplay evaluationType={evaluationType} value={grade} maxMarks={maxMarks} size="small" showStarLabel />
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
          Handed in {shortDate(attempt.submitted_at)}
          {attempt.released && attempt.reviewed_at ? ` · Reviewed ${shortDate(attempt.reviewed_at)}` : ''}
        </Typography>
      </Box>

      {mode === 'awaiting' && (
        <Callout icon={<HourglassEmptyRoundedIcon fontSize="small" />} tone="#1565C0" title="Your teacher has not reviewed this yet">
          Their voice note, marks and scores will appear here when they send it back.
          {canReplace && !isOld ? ' Until then you can replace your drawing.' : ''}
        </Callout>
      )}

      {mode === 'updating' && (
        <Callout icon={<EditNoteRoundedIcon fontSize="small" />} tone="#1565C0" title="Your teacher is updating this review">
          You will see the new version here as soon as it is ready.
        </Callout>
      )}

      {mode === 'redo' && !isOld && (
        <Callout icon={<ReplayRoundedIcon fontSize="small" />} tone="#B54700" title="Your teacher asked for a redo">
          Listen to the note, look at each numbered mark on your drawing, then draw it again.
        </Callout>
      )}

      {attempt.self_note && (
        <Box sx={{ pl: 1.5, borderLeft: '3px solid', borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
            Your note
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {attempt.self_note}
          </Typography>
        </Box>
      )}

      {(mode === 'reviewed' || mode === 'redo') && (
        <ReactionAppreciation reaction={attempt.reaction as GalleryReactionType | null} />
      )}
    </Stack>
  );
}

function Callout({
  icon,
  tone,
  title,
  children,
}: {
  icon: React.ReactNode;
  tone: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1.25,
        p: 1.5,
        borderRadius: 2,
        bgcolor: alpha(tone, 0.08),
        border: `1px solid ${alpha(tone, 0.25)}`,
      }}
    >
      <Box sx={{ color: tone, display: 'flex', pt: 0.25 }} aria-hidden>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          {children}
        </Typography>
      </Box>
    </Box>
  );
}
