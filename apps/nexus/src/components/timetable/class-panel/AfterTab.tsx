'use client';

import { Box, Button, Chip, Divider, Typography } from '@neram/ui';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import ClassCaptureView from '../ClassCaptureView';
import WrapUpSection from '../WrapUpSection';
import ClassFeedbackSection from './ClassFeedbackSection';
import { SECTION_LABEL_SX } from '../timetable-theme';
import type { ClassPanelTabProps } from './types';

/**
 * What the class left behind.
 *
 * The register, the recording, the record of what was covered, and what the
 * students made of it. Only ever drawn for a class that has actually run, so
 * nothing here is ever an empty promise.
 */
export default function AfterTab(props: ClassPanelTabProps) {
  const {
    cls,
    state,
    role,
    rsvpSummary,
    attendanceSummary,
    myAttended,
    getToken,
    getTeacherToken,
    onOpenAttendance,
    onSyncRecording,
    onRate,
    onOpenRecording,
    onViewRsvpDashboard,
    onNotify,
    onChanged,
  } = props;

  const isTeacher = role === 'teacher';
  const { hasRecording, hasMeeting } = state;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* The RSVP-only chip reads as real turnout but is not, so once a class
          has happened show Total / Opted in / Attended side by side. Attended
          comes from real Teams/manual data (nexus_attendance), "Not synced yet"
          until the teacher runs Sync from Teams or Teams itself has not
          published the report. */}
      {isTeacher && rsvpSummary && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PeopleAltIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Attendance
            </Typography>
            {onViewRsvpDashboard && (
              <Typography
                variant="caption"
                color="primary"
                sx={{ ml: 'auto', cursor: 'pointer' }}
                onClick={() => onViewRsvpDashboard(cls.id)}
              >
                View details →
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 3 }}>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Total
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 700 }}>
                {rsvpSummary.total}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Opted in
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 700 }}>
                {rsvpSummary.attending}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Attended
              </Typography>
              {cls.attendance_synced_at ? (
                <Typography variant="body1" sx={{ fontWeight: 700, color: 'success.main' }}>
                  {attendanceSummary?.present ?? 0}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Not synced yet
                </Typography>
              )}
            </Box>
          </Box>

          {/* Attendance says who was here. This says what happened to everyone
              who was not, which is the half the panel never showed. */}
          {(attendanceSummary?.missed ?? 0) > 0 && (
            <Typography variant="caption" color="text.secondary">
              {attendanceSummary?.missed} missed · {attendanceSummary?.explained ?? 0} explained ·{' '}
              {attendanceSummary?.caughtUp ?? 0} caught up ·{' '}
              <Box
                component="a"
                href="/teacher/catch-up?tab=reasons"
                sx={{ color: 'primary.main', fontWeight: 700, textDecoration: 'none' }}
              >
                see why
              </Box>
            </Typography>
          )}
        </Box>
      )}

      {!isTeacher && myAttended != null && (
        <Chip
          label={myAttended ? 'You attended this class' : 'You missed this class'}
          color={myAttended ? 'success' : 'error'}
          variant="outlined"
          sx={{ alignSelf: 'flex-start' }}
        />
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {/* One button. Attendance and Insights were two, opening two dialogs
            over the same roster that went stale against each other. */}
        {isTeacher && onOpenAttendance && (
          <Button
            variant="contained"
            fullWidth
            startIcon={<PeopleAltIcon />}
            onClick={() => onOpenAttendance(cls)}
            sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
          >
            Attendance and insights
          </Button>
        )}

        {/* Opens the in-app player rather than linking out to Microsoft: a
            recording that lives in the organizer's OneDrive is shared only with
            the meeting invitees, so the outbound link refuses most students and
            any teacher who was not invited. */}
        {hasRecording && (
          <Button
            variant="contained"
            color="success"
            fullWidth
            onClick={onOpenRecording}
            startIcon={<PlayCircleOutlineIcon />}
            sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
          >
            Watch Recording
          </Button>
        )}
        {!hasRecording && hasMeeting && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textAlign: 'center', display: 'block', py: 0.5 }}
          >
            Recording not yet available
          </Typography>
        )}
        {isTeacher && !hasRecording && hasMeeting && onSyncRecording && (
          <Button
            variant="outlined"
            fullWidth
            onClick={() => onSyncRecording(cls)}
            sx={{ minHeight: 48, textTransform: 'none' }}
          >
            Sync Recording
          </Button>
        )}

        {!isTeacher && onRate && (
          <Button
            variant="outlined"
            fullWidth
            onClick={() => onRate(cls)}
            sx={{ minHeight: 48, textTransform: 'none' }}
          >
            Rate Class
          </Button>
        )}
      </Box>

      {/* What the class turned out to be: bullets, tags, and the drawings. */}
      <Divider />
      <ClassCaptureView classId={cls.id} getToken={getToken} />

      {/* Writing that record is the teacher's side of the same thing, so it sits
          directly under it. Was rail-only, so a teacher in Day, Week or Month
          had no route to the wrap up at all. */}
      {isTeacher && getTeacherToken && (
        <>
          <Divider />
          <Box>
            <Typography sx={SECTION_LABEL_SX}>Wrap up</Typography>
            <WrapUpSection
              cls={cls}
              getToken={getToken}
              getTeacherToken={getTeacherToken}
              onSaved={() => onChanged?.()}
              onNotify={onNotify}
            />
          </Box>
        </>
      )}

      {isTeacher && (
        <>
          <Divider />
          <ClassFeedbackSection {...props} />
        </>
      )}
    </Box>
  );
}
