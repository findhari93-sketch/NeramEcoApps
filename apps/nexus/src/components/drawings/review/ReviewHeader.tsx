'use client';

/**
 * The identity row at the top of a drawing review: back, who drew it, when, what
 * they were asked, which attempt this is, where it stands, and the overflow menu.
 *
 * One tree at every width. Density comes from `sx` breakpoints rather than from a
 * second copy of the row, which is what the page used to carry. `compact` exists
 * only for the avatar, whose size is a number rather than a style, so it cannot
 * be expressed as a breakpoint.
 *
 * Chip order follows the wider layout (category, then attempt, then status) at
 * every width. The narrow copy used to put the category last; keeping two orders
 * was the only thing standing between this row and a single tree.
 */

import { Box, Chip, IconButton, Typography } from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CategoryBadge from '@/components/drawings/CategoryBadge';
import StudentAvatar from '@/components/students/StudentAvatar';

export interface ReviewHeaderProps {
  onBack: () => void;
  studentId?: string | null;
  studentName?: string | null;
  studentAvatarUrl?: string | null;
  timeAgo: string;
  /** The brief the student was working to. Truncated to one line. */
  questionText: string;
  category?: string | null;
  /** 1-based position in the redo thread; 0 when this round is not in `total`. */
  attemptIndex: number;
  attemptTotal: number;
  statusLabel: string;
  statusColor: 'warning' | 'success' | 'info';
  onOpenMenu: (anchor: HTMLElement) => void;
  /** Narrow layout: a smaller avatar. Everything else is a breakpoint. */
  compact: boolean;
  /** Where this drawing sits among the assignment's pending reviews. */
  queue?: { position: number | null; total: number; laneLabel?: string | null };
}

export default function ReviewHeader({
  onBack, studentId, studentName, studentAvatarUrl, timeAgo, questionText,
  category, attemptIndex, attemptTotal, statusLabel, statusColor, onOpenMenu, compact, queue,
}: ReviewHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 1, md: 1.5 },
        px: { xs: 1.5, md: 2 },
        py: { xs: 0.75, md: 1 },
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        flexShrink: 0,
      }}
    >
      <IconButton onClick={onBack} size="small" aria-label="Back" sx={{ p: { xs: 0.5, md: 1 } }}>
        <ArrowBackIcon sx={{ fontSize: { xs: 20, md: 24 } }} />
      </IconButton>

      <StudentAvatar
        userId={studentId}
        src={studentAvatarUrl}
        name={studentName}
        size={compact ? 28 : 36}
      />

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, md: 1 } }}>
          <Typography
            variant="body2"
            fontWeight={600}
            noWrap
            sx={{ fontSize: { xs: '0.82rem', md: '0.875rem' } }}
          >
            {studentName || 'Student'}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: { xs: '0.7rem', md: '0.75rem' }, flexShrink: 0 }}
          >
            {timeAgo}
          </Typography>
        </Box>
        {questionText && (
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{ display: 'block', fontSize: { xs: '0.68rem', md: '0.75rem' }, lineHeight: 1.3 }}
          >
            {questionText}
          </Typography>
        )}
      </Box>

      {category && <CategoryBadge category={category} />}

      {attemptTotal > 1 && attemptIndex > 0 && (
        <Chip
          label={`Attempt ${attemptIndex}/${attemptTotal}`}
          size="small"
          color="warning"
          variant="outlined"
          sx={{ height: { xs: 22, md: 24 }, fontWeight: 700 }}
        />
      )}

      {queue && queue.position != null && queue.total > 0 && (
        <Chip
          label={`${queue.position} / ${queue.total}`}
          size="small"
          variant="outlined"
          aria-label={
            queue.laneLabel
              ? `Drawing ${queue.position} of ${queue.total} in ${queue.laneLabel}. J and K move between them.`
              : `Drawing ${queue.position} of ${queue.total} waiting for review. J and K move between them.`
          }
          title="J next, K previous"
          sx={{ height: { xs: 22, md: 24 }, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
        />
      )}

      <Chip
        label={statusLabel}
        size="small"
        color={statusColor}
        sx={{ height: { xs: 22, md: 24 }, fontWeight: 700, fontSize: { xs: '0.65rem', md: '0.75rem' } }}
      />

      <IconButton
        size="small"
        aria-label="More actions"
        onClick={(e) => onOpenMenu(e.currentTarget)}
        sx={{ p: { xs: 0.5, md: 1 } }}
      >
        <MoreVertIcon sx={{ fontSize: { xs: 20, md: 24 } }} />
      </IconButton>
    </Box>
  );
}
