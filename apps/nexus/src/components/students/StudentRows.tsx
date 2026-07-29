'use client';

import { Box, Typography } from '@neram/ui';
import ViewAsStudentButton from '@/components/ViewAsStudentButton';
import CopyEmailButton from './CopyEmailButton';
import StudentRowShell from './StudentRowShell';
import StudentRowChips from './StudentRowChips';
import StudentStageAvatar from './StudentStageAvatar';
import { Meter, StatPill } from './StudentStatMeters';
import { stageKeyOf } from '@/lib/student-stage';
import type { StudentRowProps } from './studentRow.types';

/**
 * The three row densities.
 *
 * They share StudentRowShell (container, tap behaviour, select checkbox) and
 * StudentRowChips (the badge row), so the classification renders identically in
 * all three. Only the layout differs, which is the only thing that ever should
 * have differed between them.
 */

function stageOf(student: StudentRowProps['student']) {
  return {
    stage: stageKeyOf(student.study_stage),
    dormant: student.participation_status === 'dormant',
  };
}

/** Compact: single-line scan row. Small avatar, name, muted email, tiny stat pills. */
export function CompactRow(props: StudentRowProps) {
  const { student, checklistPct, attColor, doneColor, presenceStatus, onCopy } = props;
  const { stage, dormant } = stageOf(student);

  return (
    <StudentRowShell
      selectMode={props.selectMode}
      selected={props.selected}
      onToggleSelect={props.onToggleSelect}
      onOpen={props.onOpen}
      dormant={dormant}
      sx={{ px: 1.5, py: 1, minHeight: 56, display: 'flex', alignItems: 'center', gap: 1.25 }}
    >
      <StudentStageAvatar
        stage={stage}
        dormant={dormant}
        msOid={student.ms_oid}
        fallbackSrc={student.avatar_url}
        name={student.name}
        size={36}
        tapToView={false}
        presenceStatus={presenceStatus}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, flexWrap: 'wrap' }}>
          <Typography noWrap sx={{ fontWeight: 700, fontSize: '0.9rem', maxWidth: '100%' }}>
            {student.name}
          </Typography>
          <StudentRowChips
            studyStage={student.study_stage}
            participationStatus={student.participation_status}
            dormantSince={student.dormant_since}
            dormantReason={student.dormant_reason}
            examBatch={student.exam_batch}
            emailStatus={student.email_status}
            awaitingMicrosoft={student.awaiting_microsoft}
            density="compact"
            showSection={false}
          />
        </Box>
        {student.email && (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontSize: '0.72rem', lineHeight: 1.3 }}>
            {student.email}
          </Typography>
        )}
      </Box>
      <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 0.75, flexShrink: 0 }}>
        <StatPill label="Att" value={student.attendance.percentage} color={attColor} />
        <StatPill label="List" value={checklistPct} color={doneColor} />
      </Box>
      {student.email && <CopyEmailButton email={student.email} title="Copy email" onCopy={onCopy} />}
      <Box onClick={(e) => e.stopPropagation()} sx={{ display: 'flex', flexShrink: 0 }}>
        <ViewAsStudentButton studentId={student.id} reason={`Student list: ${student.name}`} iconOnly />
      </Box>
    </StudentRowShell>
  );
}

/** Cards: avatar tile with chips + both progress meters, laid out in a grid. */
export function StudentCard(props: StudentRowProps) {
  const { student, checklistPct, attColor, doneColor, presenceStatus, onCopy } = props;
  const { stage, dormant } = stageOf(student);

  return (
    <StudentRowShell
      selectMode={props.selectMode}
      selected={props.selected}
      onToggleSelect={props.onToggleSelect}
      onOpen={props.onOpen}
      dormant={dormant}
      sx={{ p: 2, borderRadius: 2.5, height: '100%', display: 'flex', flexDirection: 'column', gap: 1.25 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <StudentStageAvatar
          stage={stage}
          dormant={dormant}
          msOid={student.ms_oid}
          fallbackSrc={student.avatar_url}
          name={student.name}
          size={48}
          tapToView={false}
          presenceStatus={presenceStatus}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
            {student.name}
          </Typography>
          {student.email && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              {student.email}
            </Typography>
          )}
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
            <StudentRowChips
              studyStage={student.study_stage}
              participationStatus={student.participation_status}
              dormantSince={student.dormant_since}
              dormantReason={student.dormant_reason}
              examBatch={student.exam_batch}
              batchName={student.batch?.name}
              emailStatus={student.email_status}
              awaitingMicrosoft={student.awaiting_microsoft}
              density="card"
            />
          </Box>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 2, mt: 'auto', pt: 0.5 }}>
        <Meter label="Attendance" value={student.attendance.percentage} color={attColor} />
        <Meter label="Checklist" value={checklistPct} color={doneColor} />
      </Box>
      <Box onClick={(e) => e.stopPropagation()} sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', alignItems: 'center' }}>
        {student.email && <CopyEmailButton email={student.email} title="Copy email" onCopy={onCopy} />}
        <ViewAsStudentButton studentId={student.id} reason={`Student list: ${student.name}`} iconOnly />
      </Box>
    </StudentRowShell>
  );
}

/** Detailed: the roomy two-row layout (avatar + chips on top, full meters below). */
export function DetailedRow(props: StudentRowProps) {
  const { student, checklistPct, attColor, doneColor, presenceStatus, isMobile, onCopy } = props;
  const { stage, dormant } = stageOf(student);

  return (
    <StudentRowShell
      selectMode={props.selectMode}
      selected={props.selected}
      onToggleSelect={props.onToggleSelect}
      onOpen={props.onOpen}
      dormant={dormant}
      sx={{ p: 2, minHeight: 48, display: 'block' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <StudentStageAvatar
          stage={stage}
          dormant={dormant}
          msOid={student.ms_oid}
          fallbackSrc={student.avatar_url}
          name={student.name}
          size={isMobile ? 44 : 48}
          tapToView={false}
          presenceStatus={presenceStatus}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
            <Typography variant="body1" sx={{ fontWeight: 700, fontSize: { xs: '0.92rem', sm: '1rem' } }} noWrap>
              {student.name}
            </Typography>
            <StudentRowChips
              studyStage={student.study_stage}
              participationStatus={student.participation_status}
              dormantSince={student.dormant_since}
              dormantReason={student.dormant_reason}
              examBatch={student.exam_batch}
              batchName={student.batch?.name}
              emailStatus={student.email_status}
              awaitingMicrosoft={student.awaiting_microsoft}
              density="detailed"
            />
          </Box>
          {student.email && !isMobile && (
            <Typography variant="body2" color="text.secondary" noWrap>
              {student.email}
            </Typography>
          )}
        </Box>
        {student.email && (
          <CopyEmailButton email={student.email} title={isMobile ? student.email : 'Copy email'} onCopy={onCopy} />
        )}
        <Box onClick={(e) => e.stopPropagation()} sx={{ display: 'flex', flexShrink: 0 }}>
          <ViewAsStudentButton studentId={student.id} reason={`Student list: ${student.name}`} iconOnly />
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 2, mt: 1.25, ml: { xs: 0, sm: 7.5 }, alignItems: 'center', flexWrap: 'wrap' }}>
        <Meter label="Attendance" value={student.attendance.percentage} color={attColor} />
        <Meter label="Checklist" value={checklistPct} color={doneColor} />
        {student.email && isMobile && (
          <Typography variant="caption" color="text.disabled" noWrap sx={{ ml: 'auto', maxWidth: 130, fontSize: '0.65rem' }}>
            {student.email}
          </Typography>
        )}
      </Box>
    </StudentRowShell>
  );
}
