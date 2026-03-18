'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Chip,
  SwipeableDrawer,
  Drawer,
  Divider,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import VideocamIcon from '@mui/icons-material/Videocam';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { type ClassCardData } from './ClassCard';
import MeetingRecap from './MeetingRecap';

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
  // Actions
  onEdit?: (cls: ClassCardData) => void;
  onDelete?: (classId: string) => void;
  onDeletePermanent?: (classId: string) => void;
  onRsvp?: (classId: string, response: 'attending' | 'not_attending') => void;
  onRate?: (cls: ClassCardData) => void;
  onViewAttendance?: (cls: ClassCardData) => void;
  onSyncRecording?: (cls: ClassCardData) => void;
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
  onEdit,
  onDelete,
  onDeletePermanent,
  onRsvp,
  onRate,
  onViewAttendance,
  onSyncRecording,
  onViewRsvpDashboard,
}: ClassDetailPanelProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [expanded, setExpanded] = useState(false);

  if (!cls) return null;

  const isUpcoming = cls.status === 'scheduled' || cls.status === 'live';
  const isCompleted = cls.status === 'completed';
  const isCancelled = cls.status === 'cancelled';
  const meetingUrl = cls.teams_meeting_join_url || cls.teams_meeting_url;
  const hasRecording = !!cls.recording_url;

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
          borderBottomColor: statusColors[cls.status] || 'primary.main',
          bgcolor: 'background.paper',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
              {cls.title}
            </Typography>
            <Chip
              label={cls.status}
              size="small"
              color={statusChipColor[cls.status] || 'default'}
              variant="outlined"
              sx={{ textTransform: 'capitalize', mt: 0.5 }}
            />
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

        {/* Tags */}
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          {cls.topic && <Chip label={cls.topic.title} size="small" />}
          {cls.batch && <Chip label={cls.batch.name} size="small" variant="outlined" color="secondary" />}
          {cls.teams_meeting_id && (
            <Chip
              icon={<VideocamIcon sx={{ fontSize: '16px !important' }} />}
              label="Teams Meeting"
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
        {isCompleted && role === 'student' && myAttended != null && (
          <Chip
            label={myAttended ? 'You attended this class' : 'You missed this class'}
            color={myAttended ? 'success' : 'error'}
            variant="outlined"
          />
        )}

        <Divider />

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {/* Student RSVP */}
          {role === 'student' && isUpcoming && !isCancelled && onRsvp && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                fullWidth
                variant={myRsvp === 'attending' ? 'contained' : 'outlined'}
                color="success"
                onClick={() => onRsvp(cls.id, 'attending')}
                sx={{ minHeight: 48, textTransform: 'none' }}
              >
                Will Attend
              </Button>
              <Button
                fullWidth
                variant={myRsvp === 'not_attending' ? 'contained' : 'outlined'}
                color="error"
                onClick={() => onRsvp(cls.id, 'not_attending')}
                sx={{ minHeight: 48, textTransform: 'none' }}
              >
                Can&apos;t Attend
              </Button>
            </Box>
          )}

          {/* Join meeting */}
          {isUpcoming && !isCancelled && meetingUrl && (
            <Button
              variant="contained"
              fullWidth
              href={meetingUrl}
              target="_blank"
              startIcon={<VideocamIcon />}
              sx={{ minHeight: 48, textTransform: 'none' }}
            >
              Join Meeting
            </Button>
          )}

          {/* Watch recording */}
          {isCompleted && hasRecording && (
            <Button
              variant="outlined"
              fullWidth
              href={cls.recording_url!}
              target="_blank"
              startIcon={<PlayCircleOutlineIcon />}
              sx={{ minHeight: 48, textTransform: 'none' }}
            >
              Watch Recording
            </Button>
          )}

          {/* Rate class (student) */}
          {role === 'student' && isCompleted && onRate && (
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
              {isCompleted && onViewAttendance && (
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
              {isCompleted && cls.teams_meeting_id && !hasRecording && onSyncRecording && (
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
                  onClick={() => onDelete(cls.id)}
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
              onClick={() => onDeletePermanent(cls.id)}
              sx={{ minHeight: 48, textTransform: 'none' }}
            >
              Delete Permanently
            </Button>
          )}
        </Box>

        {/* Expand/Collapse for recap */}
        {isCompleted && (
          <>
            <Button
              onClick={() => setExpanded(!expanded)}
              endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              sx={{ textTransform: 'none', alignSelf: 'center' }}
            >
              {expanded ? 'Hide Recap' : 'View Recap'}
            </Button>

            {expanded && (
              <Box sx={{ mt: 1 }}>
                <MeetingRecap
                  classId={cls.id}
                  classroomId={classroomId}
                  getToken={getToken}
                  role={role}
                />
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  );

  if (isMobile) {
    return (
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
    );
  }

  return (
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
  );
}
