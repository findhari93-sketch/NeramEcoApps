'use client';

import { useState } from 'react';
import { Box, Button, Chip, Collapse, Link, Typography } from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import ReplayIcon from '@mui/icons-material/Replay';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { preworkDueLabel } from '@/lib/prework';
import { preworkReasonShortLabel } from '@/lib/prework-reasons';
import { reactionEmoji } from '@/lib/assignment-reactions';
import type { GalleryReactionType } from '@neram/database/types';
import type { ClassPanelTabProps, PanelAssignment } from './types';

type AssignmentStatusKey = 'todo' | 'submitted' | 'redo' | 'reviewed';

function formatDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * Turn a class-attached assignment into a precise, self-explanatory status the
 * student can read at a glance. Colour is a reinforcement, never the only
 * signal (each state carries its own icon + words). A reviewed assignment also
 * surfaces the grade (stars or marks) and the teacher's reaction emoji.
 */
function assignmentStatus(a: PanelAssignment): {
  key: AssignmentStatusKey;
  label: string;
  color: 'warning' | 'info' | 'error' | 'success';
  Icon: typeof RadioButtonUncheckedIcon;
  grade: string | null;
  reaction: string;
} {
  const status = a.submission?.status ?? null;
  const reaction = reactionEmoji(a.drawing_reaction as GalleryReactionType | null | undefined);

  if (status === 'reviewed') {
    // Stars scale stores the grade as a 1-5 value; marks scale as n / max_marks.
    let grade: string | null = null;
    if (a.evaluation_type === 'stars') {
      const stars = a.drawing_rating ?? a.drawing_marks ?? a.submission?.marks ?? null;
      grade = stars != null ? `${stars}/5` : null;
    } else {
      const marks = a.drawing_marks ?? a.submission?.marks ?? null;
      grade = marks != null ? `${marks}${a.max_marks ? `/${a.max_marks}` : ''}` : null;
    }
    return { key: 'reviewed', label: 'Reviewed', color: 'success', Icon: TaskAltIcon, grade, reaction };
  }
  if (status === 'redo') {
    return { key: 'redo', label: 'Redo requested', color: 'error', Icon: ReplayIcon, grade: null, reaction };
  }
  if (status === 'submitted') {
    return {
      key: 'submitted',
      label: 'Submitted, in review',
      color: 'info',
      Icon: HourglassEmptyIcon,
      grade: null,
      reaction,
    };
  }
  return { key: 'todo', label: 'To do', color: 'warning', Icon: RadioButtonUncheckedIcon, grade: null, reaction };
}

/**
 * The work set in this class, from the student's side: their own status per
 * assignment, kept visible after the class so a late joiner still owes it.
 *
 * Tapping a row opens a quick overview in place (status, grade, reminders,
 * instructions) rather than navigating away and losing the timetable. This is a
 * different thing from the teacher's ClassAssignmentsSection, which is about
 * attaching work rather than doing it, so the two do not share a renderer.
 */
export default function StudentAssignmentList({
  assignments,
  role,
  state,
  onOpenAssignment,
  onPreworkReason,
}: ClassPanelTabProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (!assignments || assignments.length === 0) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {assignments.map((a) => {
        const st = assignmentStatus(a);
        const isOpen = openId === a.id;
        const reminders = a.reminder_count ?? 0;
        const typeLabel = a.assignment_type === 'drawing' ? 'Drawing' : 'Document';
        const TypeIcon = a.assignment_type === 'drawing' ? BrushOutlinedIcon : DescriptionOutlinedIcon;

        return (
          <Box
            key={a.id}
            sx={{
              border: '1px solid',
              borderColor: isOpen ? 'primary.light' : 'divider',
              borderRadius: 1.5,
              overflow: 'hidden',
              transition: 'border-color 150ms ease, background-color 150ms ease',
            }}
          >
            {/* Collapsed summary row (tap toggles the overview). */}
            <Box
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onClick={() => setOpenId(isOpen ? null : a.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpenId(isOpen ? null : a.id);
                }
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 1.25,
                minHeight: 48,
                cursor: 'pointer',
                '&:hover': { bgcolor: 'action.hover' },
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
              }}
            >
              <st.Icon sx={{ fontSize: 20, color: `${st.color}.main`, flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                  {a.title}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                  <Typography variant="caption" color={`${st.color}.main`} sx={{ fontWeight: 600 }}>
                    {st.label}
                    {st.key === 'reviewed' && st.grade ? ` · ${st.grade}` : ''}
                    {st.key === 'reviewed' && st.reaction ? ` ${st.reaction}` : ''}
                  </Typography>
                  {reminders > 0 && (
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
                      <NotificationsActiveOutlinedIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
                      <Typography variant="caption" color="text.disabled">
                        Reminded ×{reminders}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Box>
              {isOpen ? (
                <ExpandLessIcon sx={{ color: 'text.secondary' }} />
              ) : (
                <ExpandMoreIcon sx={{ color: 'text.secondary' }} />
              )}
            </Box>

            {/* Expanded overview: enough to know what the work is, without
                leaving the page. "Open full assignment" is there for those who
                actually want to submit or read the full brief. */}
            <Collapse in={isOpen} unmountOnExit>
              <Box sx={{ px: 1.25, pb: 1.5, pt: 0.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Chip
                    size="small"
                    icon={<TypeIcon sx={{ fontSize: '15px !important' }} />}
                    label={typeLabel}
                    variant="outlined"
                  />
                  <Typography variant="caption" color="text.secondary">
                    {/* Prework is due at a TIME of day, not on a day. A bare
                        date here reads as "any time that day", which is exactly
                        the misunderstanding it has to avoid. */}
                    {a.timing === 'prework'
                      ? preworkDueLabel(a.due_at)
                      : a.due_at
                        ? `Due ${formatDate(a.due_at.slice(0, 10))}`
                        : 'No due date'}
                  </Typography>
                </Box>

                {/* Not done, class still to come: the one prompt that matters.
                    Never disables anything, including Join. */}
                {a.timing === 'prework' &&
                  role === 'student' &&
                  st.key === 'todo' &&
                  !state.isPast &&
                  onPreworkReason && (
                    <Button
                      variant={a.prework_reason_code ? 'text' : 'contained'}
                      color={a.prework_reason_code ? 'inherit' : 'warning'}
                      fullWidth
                      onClick={() => onPreworkReason(a)}
                      sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
                    >
                      {a.prework_reason_code
                        ? `You said: ${preworkReasonShortLabel(a.prework_reason_code)}. Change my answer`
                        : 'Tell us why I have not done it'}
                    </Button>
                  )}

                {a.instructions && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      display: '-webkit-box',
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {a.instructions}
                  </Typography>
                )}

                {st.key === 'redo' && a.submission?.feedback && (
                  <Box
                    sx={{
                      p: 1,
                      borderRadius: 1,
                      bgcolor: 'error.50',
                      border: '1px solid',
                      borderColor: 'error.light',
                    }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'error.dark', display: 'block' }}>
                      Redo requested
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {a.submission.feedback}
                    </Typography>
                  </Box>
                )}

                {onOpenAssignment && (
                  <Link
                    component="button"
                    type="button"
                    onClick={() => onOpenAssignment(a.id)}
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.5,
                      alignSelf: 'flex-start',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    Open full assignment
                    <ArrowForwardIcon sx={{ fontSize: 16 }} />
                  </Link>
                )}
              </Box>
            </Collapse>
          </Box>
        );
      })}
    </Box>
  );
}
