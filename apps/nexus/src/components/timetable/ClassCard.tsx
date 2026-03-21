'use client';

import { Box, Typography, Chip, Button, IconButton, Rating } from '@neram/ui';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VideocamIcon from '@mui/icons-material/Videocam';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';

export interface ClassCardData {
  id: string;
  title: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status: string;
  teams_meeting_url: string | null;
  teams_meeting_join_url: string | null;
  teams_meeting_id: string | null;
  teams_meeting_scope: string | null;
  recording_url: string | null;
  batch_id: string | null;
  target_scope?: string | null;
  topic: { id: string; title: string; category: string } | null;
  teacher: { id: string; name: string; avatar_url: string | null } | null;
  batch: { id: string; name: string } | null;
  classroom?: { id: string; name: string; type: string } | null;
}

interface ClassCardProps {
  cls: ClassCardData;
  role: 'teacher' | 'student' | 'parent';
  // RSVP data (for display)
  rsvpSummary?: { attending: number; total: number } | null;
  myRsvp?: 'attending' | 'not_attending' | null;
  // Review data
  averageRating?: number | null;
  myAttended?: boolean | null;
  // Click handler — opens detail panel
  onClick?: (cls: ClassCardData) => void;
  // Actions (legacy — used when no detail panel)
  onEdit?: (cls: ClassCardData) => void;
  onDelete?: (classId: string) => void;
  onRsvp?: (classId: string, response: 'attending' | 'not_attending') => void;
  onRate?: (cls: ClassCardData) => void;
  onViewAttendance?: (cls: ClassCardData) => void;
  onSyncRecording?: (cls: ClassCardData) => void;
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

export default function ClassCard({
  cls,
  role,
  rsvpSummary,
  myRsvp,
  averageRating,
  myAttended,
  onClick,
  onEdit,
  onDelete,
  onRsvp,
  onRate,
  onViewAttendance,
  onSyncRecording,
}: ClassCardProps) {
  const isUpcoming = cls.status === 'scheduled' || cls.status === 'live';
  const isCompleted = cls.status === 'completed';
  const isCancelled = cls.status === 'cancelled';
  const meetingUrl = cls.teams_meeting_join_url || cls.teams_meeting_url;
  const hasRecording = !!cls.recording_url;

  return (
    <Box
      onClick={() => onClick?.(cls)}
      sx={{
        p: 1.5,
        borderLeft: '4px solid',
        borderLeftColor: statusColors[cls.status] || 'primary.main',
        borderRadius: 1,
        bgcolor: 'background.paper',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
        opacity: isCancelled ? 0.6 : 1,
        cursor: onClick ? 'pointer' : 'default',
        '&:hover': { boxShadow: '0 2px 8px rgba(0,0,0,0.12)' },
        transition: 'box-shadow 0.2s',
      }}
    >
      {/* Header: Title + Status */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }} noWrap>
            {cls.title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatTime(cls.start_time)} - {formatTime(cls.end_time)}
            {cls.teacher && ` · ${cls.teacher.name}`}
          </Typography>
        </Box>
        <Chip
          label={cls.status}
          size="small"
          color={statusChipColor[cls.status] || 'default'}
          variant="outlined"
          sx={{ textTransform: 'capitalize', fontSize: '0.65rem', height: 22 }}
        />
      </Box>

      {/* Tags row: Classroom + Topic + Batch */}
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        {cls.classroom && (
          <Chip
            label={cls.classroom.type === 'common' ? 'All' : cls.classroom.name}
            size="small"
            color={cls.classroom.type === 'common' ? 'warning' : cls.classroom.type === 'nata' ? 'primary' : cls.classroom.type === 'jee' ? 'secondary' : 'default'}
            sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600 }}
          />
        )}
        {cls.topic && (
          <Chip label={cls.topic.title} size="small" sx={{ height: 20, fontSize: '0.65rem' }} />
        )}
        {cls.batch && (
          <Chip
            label={cls.batch.name}
            size="small"
            variant="outlined"
            color="secondary"
            sx={{ height: 20, fontSize: '0.65rem' }}
          />
        )}
        {cls.teams_meeting_id && (
          <VideocamIcon sx={{ fontSize: 16, color: 'primary.main', ml: 0.5 }} />
        )}
      </Box>

      {/* RSVP / Rating / Attendance info */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {/* RSVP info */}
        {isUpcoming && rsvpSummary && role === 'teacher' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <PeopleAltIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary">
              {rsvpSummary.attending}/{rsvpSummary.total} attending
            </Typography>
          </Box>
        )}

        {/* Average rating for teachers */}
        {isCompleted && averageRating != null && averageRating > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Rating value={averageRating} precision={0.1} size="small" readOnly sx={{ fontSize: 14 }} />
            <Typography variant="caption" color="text.secondary">
              {averageRating.toFixed(1)}
            </Typography>
          </Box>
        )}

        {/* Student's own attendance badge */}
        {isCompleted && role === 'student' && myAttended != null && (
          <Chip
            icon={myAttended ? <CheckCircleIcon sx={{ fontSize: '14px !important' }} /> : <CancelIcon sx={{ fontSize: '14px !important' }} />}
            label={myAttended ? 'Attended' : 'Missed'}
            size="small"
            color={myAttended ? 'success' : 'error'}
            variant="outlined"
            sx={{ height: 22, fontSize: '0.65rem' }}
          />
        )}
      </Box>

      {/* Actions row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25, flexWrap: 'wrap' }}>
        {/* Student RSVP buttons */}
        {role === 'student' && isUpcoming && !isCancelled && onRsvp && (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Button
              size="small"
              variant={myRsvp === 'attending' ? 'contained' : 'outlined'}
              color="success"
              onClick={() => onRsvp(cls.id, 'attending')}
              sx={{ fontSize: '0.7rem', minHeight: 30, px: 1, textTransform: 'none' }}
            >
              Will Attend
            </Button>
            <Button
              size="small"
              variant={myRsvp === 'not_attending' ? 'contained' : 'outlined'}
              color="error"
              onClick={() => onRsvp(cls.id, 'not_attending')}
              sx={{ fontSize: '0.7rem', minHeight: 30, px: 1, textTransform: 'none' }}
            >
              Can&apos;t Attend
            </Button>
          </Box>
        )}

        {/* Join meeting button */}
        {isUpcoming && !isCancelled && meetingUrl && (
          <Button
            variant="contained"
            size="small"
            href={meetingUrl}
            target="_blank"
            startIcon={<VideocamIcon sx={{ fontSize: '16px !important' }} />}
            sx={{ fontSize: '0.7rem', minHeight: 30, px: 1.5, textTransform: 'none', ml: 'auto' }}
          >
            Join
          </Button>
        )}

        {/* Watch recording button */}
        {isCompleted && hasRecording && (
          <Button
            variant="outlined"
            size="small"
            href={cls.recording_url!}
            target="_blank"
            startIcon={<PlayCircleOutlineIcon sx={{ fontSize: '16px !important' }} />}
            sx={{ fontSize: '0.7rem', minHeight: 30, px: 1.5, textTransform: 'none' }}
          >
            Recording
          </Button>
        )}

        {/* Rate class button (student, completed) */}
        {role === 'student' && isCompleted && onRate && (
          <Button
            size="small"
            variant="outlined"
            onClick={() => onRate(cls)}
            sx={{ fontSize: '0.7rem', minHeight: 30, px: 1, textTransform: 'none' }}
          >
            Rate Class
          </Button>
        )}

        {/* Teacher actions */}
        {role === 'teacher' && (
          <Box sx={{ display: 'flex', gap: 0.5, ml: 'auto' }}>
            {isCompleted && onViewAttendance && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<PeopleAltIcon sx={{ fontSize: '14px !important' }} />}
                onClick={() => onViewAttendance(cls)}
                sx={{ fontSize: '0.7rem', minHeight: 30, px: 1, textTransform: 'none' }}
              >
                Attendance
              </Button>
            )}
            {isCompleted && cls.teams_meeting_id && !hasRecording && onSyncRecording && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => onSyncRecording(cls)}
                sx={{ fontSize: '0.7rem', minHeight: 30, px: 1, textTransform: 'none' }}
              >
                Sync Recording
              </Button>
            )}
            {isUpcoming && !isCancelled && onEdit && (
              <IconButton size="small" onClick={() => onEdit(cls)} sx={{ minWidth: 36, minHeight: 36 }}>
                <EditIcon sx={{ fontSize: 18 }} />
              </IconButton>
            )}
            {isUpcoming && !isCancelled && onDelete && (
              <IconButton size="small" color="error" onClick={() => onDelete(cls.id)} sx={{ minWidth: 36, minHeight: 36 }}>
                <DeleteIcon sx={{ fontSize: 18 }} />
              </IconButton>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}
