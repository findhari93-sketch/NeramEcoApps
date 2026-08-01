'use client';

import { Box, Button, Chip, Divider, IconButton, Typography, UserAvatar, alpha, useTheme } from '@neram/ui';
import VideocamIcon from '@mui/icons-material/Videocam';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import IosShareIcon from '@mui/icons-material/IosShare';
import PrepGateCard from '../PrepGateCard';
import ClassManageSection from './ClassManageSection';
import { RADIUS } from '../timetable-theme';
import type { ClassPanelTabProps } from './types';

/**
 * Somebody attached to this class, with their face on it.
 *
 * A name on its own is a string a student has to read and match; a photo is
 * recognised before it is read, which is the whole point on a class panel a
 * student opens twenty times a week. avatar_url is already selected by every
 * timetable route and is populated from the Microsoft Graph profile photo, so
 * this costs nothing extra to fetch.
 */
function PersonLine({
  role,
  name,
  avatarUrl,
}: {
  role: string;
  name: string;
  avatarUrl?: string | null;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
      <UserAvatar name={name} src={avatarUrl} size={36} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block' }}>
          {role}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
          {name}
        </Typography>
      </Box>
    </Box>
  );
}

/**
 * What this class is, and how to get into it.
 *
 * The first question anybody asks of a class, teacher or student. Everything
 * that is about the work it sets lives on Prep, and everything about what it
 * left behind lives on After, so this tab stays short enough to read.
 */
export default function ClassTab(props: ClassPanelTabProps) {
  const {
    cls,
    state,
    role,
    getToken,
    rsvpSummary,
    myRsvp,
    prep,
    onPrepChanged,
    onRsvp,
    onCreateMeeting,
    onViewRsvpDashboard,
    onOpenShare,
    onNotify,
  } = props;
  const theme = useTheme();
  const { isUpcoming, isCancelled, meetingUrl, prepShut, hasMeeting, isRealChannelMeeting, hasCalendarEntry } =
    state;

  const handleCopyLink = () => {
    if (!meetingUrl) return;
    // The .catch matters: iOS Safari rejects writeText outside a tightly bound
    // gesture, and clipboard is undefined altogether on an insecure origin.
    // Both used to fail here in total silence, leaving the teacher to paste
    // nothing.
    navigator.clipboard
      ?.writeText(meetingUrl)
      .then(() => onNotify('Meeting link copied!', 'success'))
      .catch(() => onNotify('Your browser blocked the clipboard.', 'error'));
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {cls.teacher && (
        <PersonLine role="Teacher" name={cls.teacher.name} avatarUrl={cls.teacher.avatar_url} />
      )}

      {/* No avatar_url here: organizer_name is a string copied off the Teams
          meeting, not a joined user row, so there is nobody to look a photo up
          against. Initials are the honest fallback. */}
      {cls.organizer_name && cls.teacher && cls.organizer_name !== cls.teacher.name && (
        <PersonLine role="Organized by" name={cls.organizer_name} />
      )}

      {cls.description && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Description
          </Typography>
          {/* overflowWrap: a brief imported from a Teams meeting body often
              carries a bare join URL, which otherwise forces the whole panel to
              scroll sideways at 375px. */}
          <Typography variant="body2" sx={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
            {cls.description}
          </Typography>
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        {(cls.course_topic?.title || cls.topic?.title) && (
          <Chip label={cls.course_topic?.title || cls.topic?.title} size="small" />
        )}
        {cls.batch && <Chip label={cls.batch.name} size="small" variant="outlined" color="secondary" />}
        {hasMeeting && (
          <Chip
            icon={<VideocamIcon sx={{ fontSize: '16px !important' }} />}
            label={
              isRealChannelMeeting ? 'Channel Meeting' : hasCalendarEntry ? 'Calendar Event' : 'Teams Link'
            }
            size="small"
            color="primary"
            variant="outlined"
          />
        )}
      </Box>

      {/* RSVP is the only number that means anything before a class has
          happened. Afterwards the After tab carries the real turnout. */}
      {role === 'teacher' && rsvpSummary && isUpcoming && (
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

      <Divider />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {/* Student RSVP. Everyone attends by default, so this states the default
            as settled fact with one quiet way out, rather than posing it as an
            open question with two competing buttons. */}
        {role === 'student' &&
          isUpcoming &&
          !isCancelled &&
          onRsvp &&
          (myRsvp === 'not_attending' ? (
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
          ))}

        {/* The prep gate, when it is shut. Rendered INSTEAD of Join, not
            alongside a disabled one: a greyed button says nothing about what to
            do next, and this card is entirely about what to do next. The server
            has already stripped meetingUrl, so the Join block below cannot
            render at the same time. */}
        {isUpcoming && !isCancelled && prepShut && prep && (
          <PrepGateCard classId={cls.id} prep={prep} getToken={getToken} onChanged={onPrepChanged} />
        )}

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
            {/* Copy is suppressed while the gate is shut for this student.
                Handing over the URL through a copy button would make the whole
                gate decorative. Teachers are unaffected: they still receive
                meetingUrl from the server, so prepShut is false for them. */}
            <IconButton
              onClick={handleCopyLink}
              aria-label="Copy meeting link"
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

        {/* The meeting's state, said once. The planner rail had "Meeting ready"
            and the drawer had "Create Teams Meeting", so the same class read as
            set up in one view and unset in another. */}
        {role === 'teacher' &&
          isUpcoming &&
          !isCancelled &&
          (hasMeeting ? (
            !meetingUrl && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.125,
                  bgcolor: alpha(theme.palette.success.main, 0.1),
                  borderRadius: RADIUS.control,
                  px: 1.375,
                  py: 1.125,
                }}
              >
                <VideocamIcon sx={{ fontSize: 18, color: 'success.dark' }} />
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.dark' }}>
                  Meeting ready
                </Typography>
              </Box>
            )
          ) : (
            onCreateMeeting && (
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
            )
          ))}

        {/* Share this class (teacher).
            Replaces the old "Copy for WhatsApp" button, which only ever covered
            an upcoming class and carried no recording, no work and no test. The
            text this copies still suits WhatsApp, so nothing was lost.
            A cancelled class is excluded on purpose: announceCancellationToTeams
            has already said the only thing there is to say about it. */}
        {role === 'teacher' && !isCancelled && (
          <Button
            variant="outlined"
            fullWidth
            onClick={onOpenShare}
            startIcon={<IosShareIcon />}
            sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
          >
            Share this class
          </Button>
        )}
      </Box>

      <ClassManageSection {...props} />
    </Box>
  );
}
