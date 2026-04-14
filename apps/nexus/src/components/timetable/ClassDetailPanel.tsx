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
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
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
  onCreateMeeting,
  onViewRsvpDashboard,
}: ClassDetailPanelProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'cancel' | 'delete' | null>(null);

  if (!cls) return null;

  const isUpcoming = cls.status === 'scheduled' || cls.status === 'live';
  const isLive = cls.status === 'live';
  const isCompleted = cls.status === 'completed';
  const isCancelled = cls.status === 'cancelled';
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
            <Box sx={{ display: 'flex', gap: 0.75, mt: 0.5, flexWrap: 'wrap' }}>
              <Chip
                label={cls.status}
                size="small"
                color={statusChipColor[cls.status] || 'default'}
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
          {cls.topic && <Chip label={cls.topic.title} size="small" />}
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

          {/* Watch recording */}
          {isCompleted && hasRecording && (
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
          {isCompleted && !hasRecording && cls.teams_meeting_id && (
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', display: 'block', py: 0.5 }}>
              Recording not yet available
            </Typography>
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
    <Snackbar
      open={copied}
      autoHideDuration={2000}
      onClose={() => setCopied(false)}
      message="Meeting link copied!"
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    />
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
