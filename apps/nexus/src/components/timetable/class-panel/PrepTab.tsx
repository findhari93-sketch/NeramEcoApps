'use client';

import { Box, Divider, Typography } from '@neram/ui';
import ClassPrepRoster from '../ClassPrepRoster';
import ClassAssignmentsSection from '../ClassAssignmentsSection';
import ClassPrepTestSection from '../ClassPrepTestSection';
import ClassResourcesSection from '../ClassResourcesSection';
import StudentAssignmentList from './StudentAssignmentList';
import RecordingSyncToggle from './RecordingSyncToggle';
import { SECTION_LABEL_SX } from '../timetable-theme';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { ClassPanelTabProps } from './types';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Typography sx={SECTION_LABEL_SX}>{children}</Typography>;
}

/**
 * What this class hands out, and what it asks for first.
 *
 * The planner rail's whole reason for existing, now reachable from every view.
 * Ordered the way a teacher sets a class up: who is ready, the work, the test
 * they owe before joining, the material that helps, and whether the recording
 * will look after itself.
 */
export default function PrepTab(props: ClassPanelTabProps) {
  const {
    cls,
    role,
    state,
    getToken,
    refreshKey,
    assignments,
    assignmentsEditable,
    onLinkAssignment,
    onCreateAssignment,
    onSetPrepTest,
    onNotify,
    onChanged,
  } = props;

  const { featureFlags } = useNexusAuthContext();
  // Staff flags, so they default on per the registry invariant. Switch them off
  // from /teacher/admin/features to hide a section without a deploy.
  const prepTestEnabled = featureFlags?.['staff.class-prep-test'] !== false;
  // Switching this off hides the editor but leaves what a teacher already
  // shared visible to students, which is the right way round for material they
  // have been pointed at.
  const resourcesEnabled = featureFlags?.['staff.class-resources'] !== false;

  const isTeacher = role === 'teacher';
  const teacherEditable = isTeacher && !!assignmentsEditable;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Who has done what was asked. Above the work itself because "did they do
          it" is the more actionable question ten minutes before a class than
          "what was it". Self-hiding when nothing was asked of anybody. */}
      {isTeacher && (
        <ClassPrepRoster classId={cls.id} getToken={getToken} refreshKey={refreshKey} />
      )}

      {teacherEditable && (
        <ClassAssignmentsSection
          cls={cls}
          getToken={getToken}
          editable
          refreshKey={refreshKey}
          onLinkExisting={onLinkAssignment}
          onCreateAssignment={onCreateAssignment}
          onNotify={onNotify}
          header={<SectionLabel>Assignment</SectionLabel>}
        />
      )}

      {/* The student's own side of the same work. A different question from the
          teacher's list above, so a different renderer. */}
      {!isTeacher && assignments && assignments.length > 0 && (
        <Box>
          <SectionLabel>{assignments.length > 1 ? 'Assignments' : 'Assignment'}</SectionLabel>
          <Box sx={{ mt: 1 }}>
            <StudentAssignmentList {...props} />
          </Box>
        </Box>
      )}

      {/* Sits directly under Assignment because the two together are what a
          student owes before they may join, and a teacher setting one almost
          always wants to check the other. */}
      {isTeacher && prepTestEnabled && (
        <>
          <Divider />
          <ClassPrepTestSection
            cls={cls}
            getToken={getToken}
            editable
            refreshKey={refreshKey}
            onSetTest={onSetPrepTest}
            onNotify={onNotify}
            header={<SectionLabel>Test before class</SectionLabel>}
          />
        </>
      )}

      {/* After the two things a student owes and before the recording, because
          it is the third thing this class hands them: help understanding the
          topic, offered rather than required.

          Deliberately NOT gated on isPast for a student: someone who wants to
          read ahead should be able to, and the one catching up weeks later is
          exactly who this list exists for. */}
      {(!isTeacher || resourcesEnabled) && (
        <>
          <Divider />
          <ClassResourcesSection
            cls={cls}
            getToken={getToken}
            editable={isTeacher}
            hideWhenEmpty={!isTeacher}
            refreshKey={refreshKey}
            onNotify={onNotify}
            header={<SectionLabel>Reference material</SectionLabel>}
          />
        </>
      )}

      {/* Nothing to decide about a recording that already exists or never will. */}
      {isTeacher && !state.isPast && !state.isCancelled && (
        <>
          <Divider />
          <RecordingSyncToggle cls={cls} getToken={getToken} onNotify={onNotify} onChanged={onChanged} />
        </>
      )}
    </Box>
  );
}
