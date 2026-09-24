'use client';

import { Box, Button, Chip, Divider, Typography } from '@neram/ui';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import ClassOutcomeCard from './ClassOutcomeCard';
import ClassCaptureView from '../ClassCaptureView';
import WrapUpSection from '../WrapUpSection';
import ClassFeedbackSection from './ClassFeedbackSection';
import RecordingSection from './RecordingSection';
import { SECTION_LABEL_SX } from '../timetable-theme';
import { attendanceStanding, recordingAction } from './class-state';
import type { ClassPanelTabProps } from './types';

/** What each standing says, and in what colour. Text always carries the meaning. */
const STANDING_CHIP = {
  attended: { label: 'You attended this class', color: 'success' },
  'caught-up': { label: 'You caught up on this class', color: 'success' },
  missed: { label: 'You missed this class', color: 'error' },
} as const;

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
    classroomId,
    myAttended,
    myAbsence,
    getToken,
    getTeacherToken,
    onOpenAttendance,
    onSyncRecording,
    onRate,
    onOpenRecording,
    onCatchUp,
    onNotify,
    onChanged,
  } = props;

  const isTeacher = role === 'teacher';
  // The class's own classroom: a Common class can sit in another one, and the
  // attendance routes 404 on a mismatch.
  const ownClassroomId =
    ((cls as unknown as { classroom_id?: string }).classroom_id as string | undefined) ||
    cls.classroom?.id ||
    classroomId;
  const { hasRecording, hasMeeting } = state;

  // Both derived in class-state, so the chip and the button can never tell the
  // student two different stories about the same class.
  const standing = isTeacher ? null : attendanceStanding(myAttended, myAbsence);
  const action = recordingAction(cls, role, myAbsence);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* How this class went: who came, and for everyone who did not, whether
          they told us why and whether they have caught up, plus the class's
          homework. Reads the same payload as the Attendance dialog, so the two
          can never disagree (the old row read a per-class fan-out the timetable
          skips in Month view, and printed "Attended 0" beside a dialog of 20). */}
      {isTeacher && (
        <ClassOutcomeCard
          classId={cls.id}
          classroomId={ownClassroomId}
          getToken={getToken}
          onOpen={onOpenAttendance ? (opts) => onOpenAttendance(cls, opts) : undefined}
        />
      )}

      {standing && (
        <Chip
          label={STANDING_CHIP[standing].label}
          color={STANDING_CHIP[standing].color}
          variant="outlined"
          sx={{ alignSelf: 'flex-start' }}
        />
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {/* One button. Attendance, Insights and the RSVP dashboard were three,
            opening three surfaces over the same roster that went stale against
            each other. It opens on whoever still owes this class. */}
        {isTeacher && onOpenAttendance && (
          <Button
            variant="contained"
            fullWidth
            startIcon={<PeopleAltIcon />}
            onClick={() => onOpenAttendance(cls)}
            sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
          >
            Attendance and follow-up
          </Button>
        )}

        <RecordingSection
          cls={cls}
          isTeacher={isTeacher}
          action={action}
          hasRecording={hasRecording}
          hasMeeting={hasMeeting}
          onOpenRecording={onOpenRecording}
          onCatchUp={onCatchUp ? () => onCatchUp(cls) : undefined}
          onSyncRecording={onSyncRecording}
          getToken={getToken}
          classroomId={classroomId}
          onNotify={onNotify}
          onChanged={onChanged}
        />

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
