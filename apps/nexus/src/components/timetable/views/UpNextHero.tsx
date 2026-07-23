'use client';

import { Box, Button, Divider, Link, Typography, UserAvatar, alpha, useTheme } from '@neram/ui';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import VideocamIcon from '@mui/icons-material/Videocam';
import { type ClassCardData } from '../ClassCard';
import { classStartDate, formatCountdown, formatTime, isToday } from '../date-utils';
import { RADIUS, SHADOW, pulseAnimation } from '../timetable-theme';

interface UpNextHeroProps {
  cls: ClassCardData;
  now: Date;
  /** True once the class is running, so the countdown becomes a join prompt. */
  isLive: boolean;
  role: 'teacher' | 'student' | 'parent';
  /**
   * The student's own RSVP. Undefined means attending: everyone is in by
   * default and only opt-outs are recorded.
   */
  myRsvp?: 'attending' | 'not_attending' | null;
  /** Reason the student gave when opting out. */
  myRsvpReason?: string | null;
  onDecline?: (cls: ClassCardData) => void;
  onCatchUp?: (cls: ClassCardData) => void;
  onDetails?: (cls: ClassCardData) => void;
}

/**
 * The "up next" card: the one class that matters right now, given the whole
 * top of the timetable.
 *
 * Its job is to answer three questions without a tap: what is next, how long
 * until it starts, and am I going. The RSVP block states the default ("You're
 * attending") as settled fact with one quiet escape hatch, rather than posing
 * it as an unanswered question with two competing buttons.
 */
export default function UpNextHero({
  cls,
  now,
  isLive,
  role,
  myRsvp,
  myRsvpReason,
  onDecline,
  onCatchUp,
  onDetails,
}: UpNextHeroProps) {
  const theme = useTheme();
  const start = classStartDate(cls.scheduled_date, cls.start_time);
  const countdown = formatCountdown(start, now);
  const meetingUrl = cls.teams_meeting_join_url || cls.teams_meeting_url;
  const optedOut = myRsvp === 'not_attending';
  const today = isToday(new Date(`${cls.scheduled_date}T00:00:00`));

  const dayLabel = today
    ? 'Today'
    : new Date(`${cls.scheduled_date}T00:00:00`).toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
      });

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1.5fr 1fr' },
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: RADIUS.card,
        boxShadow: SHADOW.card,
        bgcolor: 'background.paper',
        overflow: 'hidden',
      }}
    >
      {/* Left: what the class is */}
      <Box sx={{ p: { xs: 2.5, md: 3.25 } }}>
        <Typography
          sx={{
            fontSize: '0.6563rem',
            fontWeight: 700,
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            color: 'primary.main',
          }}
        >
          {isLive ? 'Happening now' : 'Up next'}, {dayLabel}
        </Typography>

        <Typography
          component="h2"
          sx={{
            mt: 1,
            mb: 1.5,
            fontSize: { xs: '1.375rem', md: '1.625rem' },
            fontWeight: 800,
            letterSpacing: '-.02em',
            lineHeight: 1.2,
          }}
        >
          {cls.title}
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.125, mb: 2, flexWrap: 'wrap' }}>
          {cls.teacher && (
            <>
              <UserAvatar src={cls.teacher.avatar_url} name={cls.teacher.name} size={26} />
              <Typography variant="body2" color="text.secondary">
                {cls.teacher.name}
              </Typography>
              <Box sx={{ width: '1px', height: 14, bgcolor: 'divider' }} />
            </>
          )}
          <Typography variant="body2" color="text.secondary">
            {formatTime(cls.start_time)} to {formatTime(cls.end_time)}
          </Typography>
        </Box>

        {cls.description && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ lineHeight: 1.6, mb: 2.5, maxWidth: '46ch', whiteSpace: 'pre-line' }}
          >
            {cls.description}
          </Typography>
        )}

        <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
          {meetingUrl && (
            <Button
              variant="contained"
              href={meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              startIcon={<VideocamIcon />}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: RADIUS.control,
                minHeight: 48,
                flex: { xs: 1, sm: '0 0 auto' },
                ...(isLive && { bgcolor: 'success.main', '&:hover': { bgcolor: 'success.dark' } }),
              }}
            >
              {isLive ? 'Join now' : 'Join on Teams'}
            </Button>
          )}
          {onDetails && (
            <Button
              variant="outlined"
              onClick={() => onDetails(cls)}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: RADIUS.control, minHeight: 48 }}
            >
              Class details
            </Button>
          )}
        </Box>
      </Box>

      {/* Right: when it starts, and whether you are going */}
      <Box
        sx={{
          p: { xs: 2.5, md: 3 },
          bgcolor: alpha(theme.palette.primary.main, 0.04),
          borderLeft: { xs: 'none', md: `1px solid ${theme.palette.divider}` },
          borderTop: { xs: `1px solid ${theme.palette.divider}`, md: 'none' },
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Box>
          <Typography
            sx={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: 'text.secondary',
            }}
          >
            {isLive ? 'In progress' : 'Starts in'}
          </Typography>
          <Typography
            sx={{
              mt: 0.5,
              fontWeight: 800,
              fontSize: '2.125rem',
              letterSpacing: '-.02em',
              lineHeight: 1.1,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              color: isLive ? 'error.main' : 'text.primary',
            }}
          >
            {isLive && (
              <FiberManualRecordIcon
                sx={{
                  fontSize: 14,
                  ...pulseAnimation('heroLive'),
                  '@keyframes heroLive': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
                }}
              />
            )}
            {isLive ? 'Live' : (countdown ?? 'Starting')}
          </Typography>
        </Box>

        {role === 'student' && (
          <Box>
            <Divider sx={{ mb: 2 }} />
            {optedOut ? (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                  <Box
                    sx={{
                      width: 20,
                      height: 20,
                      borderRadius: 999,
                      bgcolor: alpha(theme.palette.error.main, 0.12),
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CloseIcon sx={{ fontSize: 12, color: 'error.dark' }} />
                  </Box>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', color: 'error.dark' }}>
                    Not attending
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  {myRsvpReason ? `Reason: ${myRsvpReason}. ` : ''}
                  We will save the recording and the assignment for you.
                </Typography>
                {onCatchUp && (
                  <Link
                    component="button"
                    onClick={() => onCatchUp(cls)}
                    sx={{ fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', minHeight: 24 }}
                  >
                    Catch up after class
                  </Link>
                )}
              </>
            ) : (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                  <Box
                    sx={{
                      width: 20,
                      height: 20,
                      borderRadius: 999,
                      bgcolor: alpha(theme.palette.success.main, 0.16),
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CheckIcon sx={{ fontSize: 12, color: 'success.dark' }} />
                  </Box>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                    You are attending
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Everyone is in by default. Something came up?
                </Typography>
                {onDecline && !isLive && (
                  <Link
                    component="button"
                    onClick={() => onDecline(cls)}
                    sx={{ fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', minHeight: 24 }}
                  >
                    I cannot make it
                  </Link>
                )}
              </>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}
