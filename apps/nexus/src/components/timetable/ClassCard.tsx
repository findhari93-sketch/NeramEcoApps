'use client';

import { Box, Typography, Rating } from '@neram/ui';
import VideocamIcon from '@mui/icons-material/Videocam';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import { formatTimeCompact } from './time-utils';
import type { ClassImageRef } from '@/lib/class-cover';
import { resourceCount } from '@/lib/class-resources';

export { formatTimeCompact };

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
  /**
   * The Outlook or group event id. NULL means the class has a join link and no
   * calendar entry, so nobody was invited. Read THIS, never teams_meeting_scope,
   * to decide whether invites went out: the scope is also written on the failure
   * path and reading it as a result is how classes came to claim "Calendar
   * invites" with an empty attendee list.
   */
  teams_calendar_event_id?: string | null;
  /**
   * The event id in the SCHEDULING TEACHER'S OWN mailbox, which is a different
   * question from the one above. A channel meeting's event sits on the M365
   * group's calendar, and that is nobody's personal calendar: it does not show
   * in Outlook or Teams desktop, and the organizer is absent from the attendee
   * list because they are the organizer. So this is NULL for a class that
   * invited every student and is still missing from the tutor's own calendar.
   */
  teams_organizer_event_id?: string | null;
  teams_meeting_degraded?: boolean | null;
  recording_url: string | null;
  /**
   * The YouTube backup, where one was uploaded.
   *
   * A class can have this and no `recording_url`, so anything asking "is there
   * anything here to watch" must read both. The catch-up route already does;
   * the panel could not, because the field was missing from this type while
   * being present on the wire.
   */
  youtube_url?: string | null;
  /**
   * What the nightly recording sweep has made of this class.
   *
   * `null` means it has not looked yet (the class is inside the 60 minute grace,
   * or the sweep has not run since it ended). `pending` means it looked and
   * Teams had nothing, with `recording_sync_attempts` counting toward the cap of
   * four. `unavailable` is terminal: Teams never published one and nothing will
   * try again. `manual` means a teacher pasted the link by hand.
   *
   * The panel reads these rather than showing a bare "Recording not yet
   * available", which said the same thing whether the sweep was mid-flight or
   * had given up a week ago. See lib/recording-backfill.
   */
  recording_sync_status?: string | null;
  recording_sync_attempts?: number | null;
  recording_sync_detail?: string | null;
  recording_fetched_at?: string | null;
  batch_id: string | null;
  target_scope?: string | null;
  meeting_group_id?: string | null;
  topic: { id: string; title: string; category: string } | null;
  /** Topic from the Course Plan Builder (nexus_course_topics). Preferred over `topic`. */
  course_topic?: { id: string; title: string } | null;
  teacher: { id: string; name: string; avatar_url: string | null } | null;
  batch: { id: string; name: string } | null;
  classroom?: { id: string; name: string; type: string } | null;
  description?: string | null;
  organizer_name?: string | null;
  attendance_synced_at?: string | null;
  /**
   * The image the teacher starred as this class's cover, and the gallery it came
   * from. Both optional: only the week/month reads embed the gallery, and a class
   * nobody wrapped up has neither. resolveClassCover falls back to the first
   * image when nothing is starred.
   */
  cover_image_id?: string | null;
  class_images?: ClassImageRef[] | null;
  /**
   * Reference-material count, as PostgREST returns an aggregate embed. Only the
   * week/month read asks for it, so it is absent everywhere else. Read it with
   * resourceCount() rather than reaching into the array.
   */
  class_resources?: Array<{ count: number }> | null;
}

interface ClassCardProps {
  cls: ClassCardData;
  role: 'teacher' | 'student' | 'parent';
  rsvpSummary?: { attending: number; total: number } | null;
  myRsvp?: 'attending' | 'not_attending' | null;
  averageRating?: number | null;
  myAttended?: boolean | null;
  onClick?: (cls: ClassCardData) => void;
  // Legacy action props (kept for backward compat, but no longer rendered on card)
  onEdit?: (cls: ClassCardData) => void;
  onDelete?: (classId: string) => void;
  onRsvp?: (classId: string, response: 'attending' | 'not_attending') => void;
  onRate?: (cls: ClassCardData) => void;
  onViewAttendance?: (cls: ClassCardData) => void;
  onSyncRecording?: (cls: ClassCardData) => void;
}

const statusBorderColors: Record<string, string> = {
  scheduled: 'primary.main',
  live: 'error.main',
  completed: 'success.main',
  cancelled: 'grey.400',
  rescheduled: 'warning.main',
};

export default function ClassCard({
  cls,
  role,
  rsvpSummary,
  myRsvp,
  averageRating,
  myAttended,
  onClick,
}: ClassCardProps) {
  const isUpcoming = cls.status === 'scheduled' || cls.status === 'live';
  const isCompleted = cls.status === 'completed';
  const isCancelled = cls.status === 'cancelled';
  const isLive = cls.status === 'live';
  const hasRecording = !!cls.recording_url;
  const hasMeeting = !!cls.teams_meeting_id;
  const materialCount = resourceCount(cls);

  // Build metadata parts: teacher + topic
  const metaParts: string[] = [];
  if (cls.teacher) metaParts.push(cls.teacher.name);
  const topicLabel = cls.course_topic?.title || cls.topic?.title;
  if (topicLabel) metaParts.push(topicLabel);

  return (
    <Box
      onClick={() => onClick?.(cls)}
      sx={{
        p: 1,
        pl: 1.5,
        borderLeft: '3px solid',
        borderLeftColor: statusBorderColors[cls.status] || 'primary.main',
        borderRadius: 1,
        bgcolor: 'background.paper',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.25,
        opacity: isCancelled ? 0.5 : 1,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 200ms ease',
        '&:hover': onClick ? {
          boxShadow: '0 3px 12px rgba(0,0,0,0.1)',
          transform: 'translateY(-1px)',
        } : {},
      }}
    >
      {/* Layer 1: Title + Time */}
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0 }}>
        {/* Live pulsing dot */}
        {isLive && (
          <FiberManualRecordIcon
            sx={{
              fontSize: 8,
              color: 'error.main',
              flexShrink: 0,
              alignSelf: 'center',
              animation: 'pulse 1.5s ease-in-out infinite',
              '@keyframes pulse': {
                '0%, 100%': { opacity: 1 },
                '50%': { opacity: 0.3 },
              },
            }}
          />
        )}
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            lineHeight: 1.4,
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textDecoration: isCancelled ? 'line-through' : 'none',
          }}
        >
          {cls.title}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            flexShrink: 0,
            fontWeight: 500,
            fontSize: '0.7rem',
          }}
        >
          {formatTimeCompact(cls.start_time, cls.end_time)}
        </Typography>
      </Box>

      {/* Layer 2: Metadata line - teacher + topic + icons */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            fontSize: '0.7rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
          }}
        >
          {metaParts.join(' \u00B7 ')}
        </Typography>

        {/* Inline micro-icons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
          {hasMeeting && (
            <VideocamIcon sx={{ fontSize: 14, color: isLive ? 'error.main' : 'primary.main' }} />
          )}
          {hasRecording && isCompleted && (
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.25,
                px: 0.5,
                py: 0.125,
                borderRadius: 0.5,
                bgcolor: 'success.main',
                color: '#fff',
                lineHeight: 1,
              }}
            >
              <PlayCircleOutlineIcon sx={{ fontSize: 10 }} />
              <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, lineHeight: 1 }}>
                REC
              </Typography>
            </Box>
          )}
          {/* "There is extra help on this class." A count, not a list: the week
              payload deliberately carries only the number. */}
          {materialCount > 0 && (
            <MenuBookOutlinedIcon
              sx={{ fontSize: 14, color: 'text.disabled' }}
              titleAccess={`${materialCount} piece${materialCount === 1 ? '' : 's'} of reference material`}
            />
          )}
        </Box>
      </Box>

      {/* Layer 3: Role-specific micro-indicators */}
      {(role === 'teacher' || role === 'student') && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.125 }}>
          {/* Teacher: RSVP count */}
          {role === 'teacher' && isUpcoming && rsvpSummary && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
              <PeopleAltIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
              <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary', fontWeight: 600 }}>
                {rsvpSummary.attending}/{rsvpSummary.total}
              </Typography>
            </Box>
          )}

          {/* Teacher: Average rating for completed */}
          {role === 'teacher' && isCompleted && averageRating != null && averageRating > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
              <Rating value={averageRating} precision={0.1} size="small" readOnly sx={{ fontSize: 12 }} />
              <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
                {averageRating.toFixed(1)}
              </Typography>
            </Box>
          )}

          {/* Student: RSVP state dot */}
          {role === 'student' && isUpcoming && !isCancelled && myRsvp && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
              <FiberManualRecordIcon
                sx={{
                  fontSize: 8,
                  color: myRsvp === 'attending' ? 'success.main' : 'error.main',
                }}
              />
              <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
                {myRsvp === 'attending' ? 'Attending' : "Can't attend"}
              </Typography>
            </Box>
          )}

          {/* Student: Attendance for completed */}
          {role === 'student' && isCompleted && myAttended != null && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
              {myAttended ? (
                <CheckCircleIcon sx={{ fontSize: 13, color: 'success.main' }} />
              ) : (
                <CancelIcon sx={{ fontSize: 13, color: 'error.main' }} />
              )}
              <Typography variant="caption" sx={{ fontSize: '0.65rem', color: myAttended ? 'success.main' : 'error.main' }}>
                {myAttended ? 'Attended' : 'Missed'}
              </Typography>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
