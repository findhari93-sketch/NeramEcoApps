'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Chip,
  Collapse,
  Rating,
  Link,
  SwipeableDrawer,
  Drawer,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import VideocamIcon from '@mui/icons-material/Videocam';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import InsightsIcon from '@mui/icons-material/Insights';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import ReplayIcon from '@mui/icons-material/Replay';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import { type ClassCardData } from './ClassCard';
import MeetingRecap from './MeetingRecap';
import ClassCaptureView from './ClassCaptureView';
import { buildClassWhatsAppMessage } from '@/lib/class-share-message';
import { reactionEmoji } from '@/lib/assignment-reactions';
import type { GalleryReactionType } from '@neram/database/types';

/** A class-attached assignment, trimmed to what the panel shows. */
export interface PanelAssignment {
  id: string;
  title: string;
  assignment_type?: string | null;
  due_at?: string | null;
  instructions?: string | null;
  submission?: { status?: string | null; feedback?: string | null; marks?: number | null } | null;
  /** Grading scale, so a reviewed grade renders as stars or marks. */
  evaluation_type?: 'marks' | 'stars' | null;
  max_marks?: number | null;
  /** Reviewed grade + reaction (drawing assignments carry these directly). */
  drawing_rating?: number | null;
  drawing_marks?: number | null;
  drawing_reaction?: string | null;
  /** How many reminders this student has been sent for this assignment. */
  reminder_count?: number | null;
}

interface ClassDetailPanelProps {
  cls: ClassCardData | null;
  open: boolean;
  onClose: () => void;
  role: 'teacher' | 'student' | 'parent';
  classroomId: string;
  getToken: () => Promise<string | null>;
  // RSVP data
  rsvpSummary?: { attending: number; total: number } | null;
  myRsvp?: 'attending' | 'not_attending' | null;
  averageRating?: number | null;
  myAttended?: boolean | null;
  /** Assignments attached to this class, so a student sees the work set in it. */
  assignments?: PanelAssignment[];
  /** Open a specific assignment (student). Omitted for teacher usage. */
  onOpenAssignment?: (assignmentId: string) => void;
  // Actions
  onEdit?: (cls: ClassCardData) => void;
  onDelete?: (classId: string) => void;
  onDeletePermanent?: (classId: string) => void;
  onRsvp?: (classId: string, response: 'attending' | 'not_attending') => void;
  onRate?: (cls: ClassCardData) => void;
  onViewAttendance?: (cls: ClassCardData) => void;
  onViewInsights?: (cls: ClassCardData) => void;
  onSyncRecording?: (cls: ClassCardData) => void;
  onCreateMeeting?: (cls: ClassCardData) => void;
  onViewRsvpDashboard?: (classId: string) => void;
}

const statusColors: Record<string, string> = {
  scheduled: 'primary.main',
  live: 'error.main',
  completed: 'success.main',
  cancelled: 'text.disabled',
  rescheduled: 'warning.main',
};

const statusChipColor: Record<string, 'primary' | 'error' | 'success' | 'default' | 'warning'> = {
  scheduled: 'primary',
  live: 'error',
  completed: 'success',
  cancelled: 'default',
  rescheduled: 'warning',
};

function formatTime(time: string) {
  const [h, m] = time.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${m} ${ampm}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

type AssignmentStatusKey = 'todo' | 'submitted' | 'redo' | 'reviewed';

/**
 * Turn a class-attached assignment into a precise, self-explanatory status the
 * student can read at a glance, colour is a reinforcement, never the only signal
 * (each state carries its own icon + words). A reviewed assignment also surfaces
 * the grade (stars or marks) and the teacher's reaction emoji.
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
    return { key: 'submitted', label: 'Submitted, in review', color: 'info', Icon: HourglassEmptyIcon, grade: null, reaction };
  }
  return { key: 'todo', label: 'To do', color: 'warning', Icon: RadioButtonUncheckedIcon, grade: null, reaction };
}

export default function ClassDetailPanel({
  cls,
  open,
  onClose,
  role,
  classroomId,
  getToken,
  rsvpSummary,
  myRsvp,
  myAttended,
  averageRating,
  assignments,
  onOpenAssignment,
  onEdit,
  onDelete,
  onDeletePermanent,
  onRsvp,
  onRate,
  onViewAttendance,
  onViewInsights,
  onSyncRecording,
  onCreateMeeting,
  onViewRsvpDashboard,
}: ClassDetailPanelProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [waCopied, setWaCopied] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'cancel' | 'delete' | null>(null);
  const [openAssignmentId, setOpenAssignmentId] = useState<string | null>(null);

  if (!cls) return null;

  const ensureSec = (t: string) => (t && t.length === 5 ? `${t}:00` : t);
  const classEndMs = new Date(`${cls.scheduled_date}T${ensureSec(cls.end_time)}+05:30`).getTime();
  // A class whose end time has passed is historical, even if its status was never
  // flipped to 'completed' (that transition depends on a Teams sync that can lag
  // or never run). Time is the honest signal for "this class already happened".
  const hasEnded = !Number.isNaN(classEndMs) && Date.now() > classEndMs;
  const isLive = cls.status === 'live';
  const isCompleted = cls.status === 'completed';
  const isCancelled = cls.status === 'cancelled';
  // Historical: finished by the clock or explicitly completed (never a cancelled one).
  const isPast = !isCancelled && (isCompleted || hasEnded);
  // Upcoming: still to come or running, and neither historical nor cancelled.
  const isUpcoming = !isCancelled && !isPast;
  // What the status chip and header accent should say: a past class reads as
  // "Completed" even if its stored status is still "scheduled".
  const displayStatus = isCancelled ? 'cancelled' : isPast ? 'completed' : cls.status;
  const meetingUrl = cls.teams_meeting_join_url || cls.teams_meeting_url;
  const hasRecording = !!cls.recording_url;

  // Compute time-until-class indicator
  const getTimeIndicator = () => {
    if (isLive) return { label: 'Live Now', color: 'error' as const };
    if (cls.status !== 'scheduled') return null;
    const now = new Date();
    const classStart = new Date(`${cls.scheduled_date}T${cls.start_time}:00+05:30`);
    const diffMs = classStart.getTime() - now.getTime();
    if (diffMs < 0) return { label: 'Starting soon', color: 'warning' as const };
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return { label: `Starts in ${diffMin} min`, color: 'warning' as const };
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return { label: `Starts in ${diffHrs}h`, color: 'primary' as const };
    return null;
  };
  const timeIndicator = getTimeIndicator();

  const handleCopyLink = () => {
    if (meetingUrl) {
      navigator.clipboard.writeText(meetingUrl).then(() => setCopied(true));
    }
  };

  const handleCopyWhatsApp = () => {
    // The RSVP link is a deep link into the student app; origin is this Nexus host.
    const rsvpUrl =
      typeof window !== 'undefined' ? `${window.location.origin}/student/rsvp/${cls.id}` : undefined;
    const message = buildClassWhatsAppMessage({
      title: cls.title,
      scheduled_date: cls.scheduled_date,
      start_time: cls.start_time,
      end_time: cls.end_time,
      joinUrl: meetingUrl,
      description: cls.description,
      rsvpUrl,
    });
    navigator.clipboard.writeText(message).then(() => setWaCopied(true));
  };

  const drawerContent = (
    <Box
      sx={{
        width: isMobile ? '100%' : 380,
        maxHeight: isMobile ? '85vh' : '100vh',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          borderBottom: '3px solid',
          borderBottomColor: statusColors[displayStatus] || 'primary.main',
          bgcolor: 'background.paper',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
              {cls.title}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, mt: 0.5, flexWrap: 'wrap' }}>
              <Chip
                label={displayStatus === 'completed' && !isCompleted ? 'Done' : displayStatus}
                size="small"
                color={statusChipColor[displayStatus] || 'default'}
                variant="outlined"
                sx={{ textTransform: 'capitalize' }}
              />
              {timeIndicator && (
                <Chip
                  icon={isLive ? <FiberManualRecordIcon sx={{ fontSize: '10px !important', animation: 'pulse 1.5s infinite' }} /> : undefined}
                  label={timeIndicator.label}
                  size="small"
                  color={timeIndicator.color}
                  variant="filled"
                  sx={{
                    fontWeight: 600,
                    '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.4 } },
                  }}
                />
              )}
              {cls.classroom && (
                <Chip
                  label={cls.classroom.type === 'common' ? 'All Students' : cls.classroom.name}
                  size="small"
                  color={cls.classroom.type === 'common' ? 'warning' : 'default'}
                  variant="outlined"
                />
              )}
            </Box>
          </Box>
          <IconButton onClick={onClose} sx={{ minWidth: 40, minHeight: 40 }}>
            <CloseIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Quick info */}
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {/* Date & Time */}
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Date & Time
          </Typography>
          <Typography variant="body2">
            {formatDate(cls.scheduled_date)}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {formatTime(cls.start_time)} - {formatTime(cls.end_time)}
          </Typography>
        </Box>

        {/* Teacher */}
        {cls.teacher && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Teacher
            </Typography>
            <Typography variant="body2">{cls.teacher.name}</Typography>
          </Box>
        )}

        {/* Organizer (if different from teacher) */}
        {cls.organizer_name && cls.teacher && cls.organizer_name !== cls.teacher.name && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Organized by
            </Typography>
            <Typography variant="body2">{cls.organizer_name}</Typography>
          </Box>
        )}

        {/* Description */}
        {cls.description && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Description
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
              {cls.description}
            </Typography>
          </Box>
        )}

        {/* Tags */}
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          {(cls.course_topic?.title || cls.topic?.title) && (
            <Chip label={cls.course_topic?.title || cls.topic?.title} size="small" />
          )}
          {cls.batch && <Chip label={cls.batch.name} size="small" variant="outlined" color="secondary" />}
          {cls.teams_meeting_id && (
            <Chip
              icon={<VideocamIcon sx={{ fontSize: '16px !important' }} />}
              label={
                cls.teams_meeting_scope === 'channel_meeting' ? 'Channel Meeting'
                : cls.teams_meeting_scope === 'calendar_event' ? 'Calendar Event'
                : 'Teams Link'
              }
              size="small"
              color="primary"
              variant="outlined"
            />
          )}
        </Box>

        {/* RSVP summary for teachers */}
        {role === 'teacher' && rsvpSummary && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              p: 1.5,
              bgcolor: 'grey.50',
              borderRadius: 1,
              cursor: onViewRsvpDashboard ? 'pointer' : 'default',
            }}
            onClick={() => onViewRsvpDashboard?.(cls.id)}
          >
            <PeopleAltIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {rsvpSummary.attending}/{rsvpSummary.total} attending
            </Typography>
            {onViewRsvpDashboard && (
              <Typography variant="caption" color="primary" sx={{ ml: 'auto' }}>
                View details →
              </Typography>
            )}
          </Box>
        )}

        {/* Student attendance badge */}
        {isPast && role === 'student' && myAttended != null && (
          <Chip
            label={myAttended ? 'You attended this class' : 'You missed this class'}
            color={myAttended ? 'success' : 'error'}
            variant="outlined"
          />
        )}

        <Divider />

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {/* Student RSVP. Everyone attends by default, so this states the
              default as settled fact with one quiet way out, rather than posing
              it as an open question with two competing buttons. */}
          {role === 'student' && isUpcoming && !isCancelled && onRsvp && (
            myRsvp === 'not_attending' ? (
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 1.5,
                  bgcolor: 'error.50',
                  border: '1px solid',
                  borderColor: 'error.light',
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'error.dark', mb: 0.5 }}>
                  You are not attending this class
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  We will keep the recording and the assignment for you.
                </Typography>
                <Button
                  fullWidth
                  variant="outlined"
                  color="success"
                  onClick={() => onRsvp(cls.id, 'attending')}
                  sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
                >
                  Actually, I will attend
                </Button>
              </Box>
            ) : (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <CheckCircleIcon sx={{ fontSize: 18, color: 'success.main' }} />
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    You are attending
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Everyone is in by default. Something came up?
                </Typography>
                <Button
                  fullWidth
                  variant="outlined"
                  color="error"
                  onClick={() => onRsvp(cls.id, 'not_attending')}
                  sx={{ minHeight: 48, textTransform: 'none' }}
                >
                  I cannot make it
                </Button>
              </Box>
            )
          )}

          {/* Join meeting + Copy Link */}
          {isUpcoming && !isCancelled && meetingUrl && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                fullWidth
                href={meetingUrl}
                target="_blank"
                startIcon={<VideocamIcon />}
                sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
              >
                Join in Teams
              </Button>
              <IconButton
                onClick={handleCopyLink}
                sx={{
                  minWidth: 48,
                  minHeight: 48,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                }}
                title="Copy meeting link"
              >
                <ContentCopyIcon />
              </IconButton>
            </Box>
          )}

          {/* Copy a ready-to-paste announcement for the WhatsApp group (teacher) */}
          {role === 'teacher' && isUpcoming && !isCancelled && (
            <Button
              variant="outlined"
              fullWidth
              onClick={handleCopyWhatsApp}
              startIcon={<ChatBubbleOutlineIcon />}
              sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
            >
              Copy for WhatsApp
            </Button>
          )}

          {/* Watch recording */}
          {isPast && hasRecording && (
            <Button
              variant="contained"
              color="success"
              fullWidth
              href={cls.recording_url!}
              target="_blank"
              rel="noopener noreferrer"
              startIcon={<PlayCircleOutlineIcon />}
              sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
            >
              Watch Recording
            </Button>
          )}
          {isPast && !hasRecording && cls.teams_meeting_id && (
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block', py: 0.5 }}>
              Recording not yet available
            </Typography>
          )}

          {/* Rate class (student) */}
          {role === 'student' && isPast && onRate && (
            <Button
              variant="outlined"
              fullWidth
              onClick={() => onRate(cls)}
              sx={{ minHeight: 48, textTransform: 'none' }}
            >
              Rate Class
            </Button>
          )}

          {/* Teacher actions */}
          {role === 'teacher' && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              {isPast && onViewAttendance && (
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<PeopleAltIcon />}
                  onClick={() => onViewAttendance(cls)}
                  sx={{ minHeight: 48, textTransform: 'none' }}
                >
                  Attendance
                </Button>
              )}
              {isPast && onViewInsights && (
                <Button
                  variant="contained"
                  fullWidth
                  startIcon={<InsightsIcon />}
                  onClick={() => onViewInsights(cls)}
                  sx={{ minHeight: 48, textTransform: 'none' }}
                >
                  Insights
                </Button>
              )}
              {isPast && cls.teams_meeting_id && !hasRecording && onSyncRecording && (
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => onSyncRecording(cls)}
                  sx={{ minHeight: 48, textTransform: 'none' }}
                >
                  Sync Recording
                </Button>
              )}
            </Box>
          )}

          {/* Create Teams Meeting (for classes without one) */}
          {role === 'teacher' && isUpcoming && !isCancelled && !cls.teams_meeting_id && onCreateMeeting && (
            <Button
              variant="contained"
              fullWidth
              color="primary"
              startIcon={<VideocamIcon />}
              onClick={() => onCreateMeeting(cls)}
              sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
            >
              Create Teams Meeting
            </Button>
          )}

          {role === 'teacher' && isUpcoming && !isCancelled && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              {onEdit && (
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<EditIcon />}
                  onClick={() => onEdit(cls)}
                  sx={{ minHeight: 48, textTransform: 'none' }}
                >
                  Edit
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="outlined"
                  fullWidth
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={() => setConfirmAction('cancel')}
                  sx={{ minHeight: 48, textTransform: 'none' }}
                >
                  Cancel Class
                </Button>
              )}
            </Box>
          )}

          {/* Delete permanently for cancelled classes */}
          {role === 'teacher' && isCancelled && onDeletePermanent && (
            <Button
              variant="outlined"
              fullWidth
              color="error"
              startIcon={<DeleteForeverIcon />}
              onClick={() => setConfirmAction('delete')}
              sx={{ minHeight: 48, textTransform: 'none' }}
            >
              Delete Permanently
            </Button>
          )}
        </Box>

        {/* Work set in this class: attached assignments the student can open and
            submit, kept visible after the class so a late joiner still owes it.
            Tapping a row opens a quick overview in place (status, grade, reminders,
            instructions) rather than navigating away and losing the timetable. */}
        {assignments && assignments.length > 0 && (
          <Box sx={{ pb: 1 }}>
            <Divider sx={{ mb: 1.5 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <AssignmentOutlinedIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {assignments.length > 1 ? 'Assignments' : 'Assignment'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {assignments.map((a) => {
                const st = assignmentStatus(a);
                const isOpen = openAssignmentId === a.id;
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
                      onClick={() => setOpenAssignmentId(isOpen ? null : a.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setOpenAssignmentId(isOpen ? null : a.id);
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
                        leaving the page. "Open full assignment" is there for those
                        who actually want to submit or read the full brief. */}
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
                            {a.due_at ? `Due ${formatDate(a.due_at.slice(0, 10))}` : 'No due date'}
                          </Typography>
                        </Box>

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
          </Box>
        )}

        {/* What the class turned out to be: bullets, tags, and the drawings. */}
        {isPast && (
          <>
            <Divider />
            <ClassCaptureView classId={cls.id} getToken={getToken} />
          </>
        )}

        {/* Class feedback + attendance (teacher). Student ratings from the "Rate
            Class" flow land in nexus_class_reviews; this is where a teacher reads
            them, average, per-student stars and comments, alongside attendance.
            Students don't get a recap toggle: "What we did" above plus their
            attendance badge and Rate Class already cover the after-class view. */}
        {isPast && role === 'teacher' && (
          <>
            <Divider />
            <Box
              role="button"
              tabIndex={0}
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setExpanded(!expanded);
                }
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                py: 1,
                minHeight: 48,
                cursor: 'pointer',
                borderRadius: 1,
                '&:hover': { bgcolor: 'action.hover' },
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
              }}
            >
              <StarRoundedIcon sx={{ color: 'warning.main' }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Class feedback
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {averageRating != null
                    ? `${averageRating}/5 average · tap for reviews & attendance`
                    : 'No student ratings yet · tap for attendance'}
                </Typography>
              </Box>
              {averageRating != null && (
                <Rating value={averageRating} precision={0.1} size="small" readOnly />
              )}
              {expanded ? (
                <ExpandLessIcon sx={{ color: 'text.secondary' }} />
              ) : (
                <ExpandMoreIcon sx={{ color: 'text.secondary' }} />
              )}
            </Box>

            <Collapse in={expanded} unmountOnExit>
              <Box sx={{ mt: 1 }}>
                <MeetingRecap
                  classId={cls.id}
                  classroomId={classroomId}
                  getToken={getToken}
                  role={role}
                />
              </Box>
            </Collapse>
          </>
        )}

        {/* Teacher Audit Info */}
        {role === 'teacher' && (
          <>
            <Divider />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Class Info
                </Typography>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75 }}>
                {cls.teacher && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Created by</Typography>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{cls.teacher.name}</Typography>
                  </Box>
                )}
                <Box>
                  <Typography variant="caption" color="text.secondary">Scope</Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                    {cls.target_scope === 'all' ? 'All Students' :
                     cls.target_scope === 'batch' ? `Batch: ${cls.batch?.name || 'N/A'}` :
                     cls.classroom?.name || 'Classroom'}
                  </Typography>
                </Box>
                {cls.teams_meeting_scope && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Teams type</Typography>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                      {cls.teams_meeting_scope === 'channel_meeting' ? 'Channel meeting'
                       : cls.teams_meeting_scope === 'calendar_event' ? 'Calendar invites'
                       : 'Link only'}
                    </Typography>
                  </Box>
                )}
                {cls.classroom && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Classroom</Typography>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{cls.classroom.name}</Typography>
                  </Box>
                )}
              </Box>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );

  // Snackbar for "Copied!" feedback
  const snackbarElement = (
    <>
      <Snackbar
        open={copied}
        autoHideDuration={2000}
        onClose={() => setCopied(false)}
        message="Meeting link copied!"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
      <Snackbar
        open={waCopied}
        autoHideDuration={2500}
        onClose={() => setWaCopied(false)}
        message="Announcement copied. Paste it in the WhatsApp group."
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  );

  if (isMobile) {
    return (
      <>
        <SwipeableDrawer
          anchor="bottom"
          open={open}
          onClose={onClose}
          onOpen={() => {}}
          disableSwipeToOpen
          PaperProps={{
            sx: {
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: '85vh',
            },
          }}
        >
          {/* Drag handle */}
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
            <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'grey.300' }} />
          </Box>
          {drawerContent}
        </SwipeableDrawer>
        {snackbarElement}
      </>
    );
  }

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={onClose}
        PaperProps={{
          sx: { width: 380 },
        }}
      >
        {drawerContent}
      </Drawer>
      {snackbarElement}

      {/* Confirmation dialog for cancel/delete */}
      <Dialog open={!!confirmAction} onClose={() => setConfirmAction(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {confirmAction === 'cancel' ? 'Cancel this class?' : 'Delete permanently?'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {confirmAction === 'cancel'
              ? `"${cls.title}" will be marked as cancelled. Students will be notified.${cls.teams_meeting_id ? ' The Teams meeting will also be cancelled.' : ''}`
              : `"${cls.title}" will be permanently removed. This cannot be undone.`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmAction(null)} sx={{ minHeight: 44 }}>
            Go Back
          </Button>
          <Button
            variant="contained"
            color="error"
            sx={{ minHeight: 44 }}
            onClick={() => {
              setConfirmAction(null);
              if (confirmAction === 'cancel') {
                onDelete?.(cls.id);
              } else {
                onDeletePermanent?.(cls.id);
              }
            }}
          >
            {confirmAction === 'cancel' ? 'Yes, Cancel Class' : 'Yes, Delete Forever'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
