'use client';

import { Box, Typography } from '@neram/ui';
import MatchHighlight from '@/components/MatchHighlight';
import StudentRowShell from './StudentRowShell';
import StudentRowChips from './StudentRowChips';
import StudentStageAvatar from './StudentStageAvatar';
import StudentStatusLine from './StudentStatusLine';
import { Meter } from './StudentStatMeters';
import { nameMatchRanges } from '@/lib/people-search';
import { stageKeyOf } from '@/lib/student-stage';
import type { StudentRowProps } from './studentRow.types';

/**
 * The three row densities.
 *
 * They share StudentRowShell (container, tap behaviour, select checkbox),
 * StudentRowChips (the badge row) and StudentStatusLine (joined and sign-in), so a
 * student reads the same in all three. Only the layout differs.
 *
 * Progress meters appear only when there is something to measure. A classroom with
 * no completed classes used to give every student two empty 0% bars, which read as
 * "everyone is failing" rather than "nothing has happened yet".
 *
 * The chips no longer carry "No Microsoft account": the status line says it once.
 * Copy email and View as student moved into the row's actions menu, which leaves
 * one 48px control on the row instead of two cramped ones.
 */

function stageOf(student: StudentRowProps['student']) {
  return {
    stage: stageKeyOf(student.study_stage),
    dormant: student.participation_status === 'dormant',
  };
}

/** The name with the searched letters marked, so it is clear why each row is listed. */
function RowName({ name, query }: { name: string; query?: string }) {
  return <MatchHighlight text={name || ''} ranges={query ? nameMatchRanges(name, query) : []} />;
}

/** Compact: the default. Name and chips, email, then the status line. */
export function CompactRow(props: StudentRowProps) {
  const { student, presenceStatus, now, actions, selectMode, query } = props;
  const { stage, dormant } = stageOf(student);
  const attendance = student.attendance.total > 0 ? student.attendance.percentage : null;

  return (
    <StudentRowShell
      selectMode={selectMode}
      selected={props.selected}
      onToggleSelect={props.onToggleSelect}
      onOpen={props.onOpen}
      dormant={dormant}
      sx={{ pl: 1.5, pr: 0.5, py: 1, minHeight: 64, display: 'flex', alignItems: 'center', gap: 1.25 }}
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
          <Typography noWrap sx={{ fontWeight: 700, fontSize: '0.95rem', maxWidth: '100%' }}>
            <RowName name={student.name} query={query} />
          </Typography>
          <StudentRowChips
            studyStage={student.study_stage}
            participationStatus={student.participation_status}
            dormantSince={student.dormant_since}
            dormantReason={student.dormant_reason}
            examBatch={student.exam_batch}
            pairStatus={student.pair_status}
            currentBatch={props.currentBatch}
            emailStatus={student.email_status}
            density="compact"
            showSection={false}
          />
        </Box>
        {student.email && (
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{ display: 'block', fontSize: '0.75rem', lineHeight: 1.35 }}
          >
            {student.email}
          </Typography>
        )}
        <StudentStatusLine student={student} now={now} attendance={attendance} />
      </Box>
      {!selectMode && actions}
    </StudentRowShell>
  );
}

/** Cards: avatar tile with chips and status, meters only when there is data. */
export function StudentCard(props: StudentRowProps) {
  const { student, checklistPct, attColor, doneColor, presenceStatus, now, actions, selectMode, query } = props;
  const { stage, dormant } = stageOf(student);
  const showAttendance = student.attendance.total > 0;
  const showChecklist = student.checklist.total > 0;

  return (
    <StudentRowShell
      selectMode={selectMode}
      selected={props.selected}
      onToggleSelect={props.onToggleSelect}
      onOpen={props.onOpen}
      dormant={dormant}
      sx={{ p: 2, pr: 1, borderRadius: 2.5, height: '100%', display: 'flex', flexDirection: 'column', gap: 1.25 }}
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
            <RowName name={student.name} query={query} />
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
              pairStatus={student.pair_status}
              currentBatch={props.currentBatch}
              batchName={student.batch?.name}
              emailStatus={student.email_status}
              density="card"
            />
          </Box>
          <StudentStatusLine student={student} now={now} />
        </Box>
        {!selectMode && actions}
      </Box>
      {(showAttendance || showChecklist) && (
        <Box sx={{ display: 'flex', gap: 2, mt: 'auto', pt: 0.5, pr: 1 }}>
          {showAttendance && <Meter label="Attendance" value={student.attendance.percentage} color={attColor} />}
          {showChecklist && <Meter label="Checklist" value={checklistPct} color={doneColor} />}
        </Box>
      )}
    </StudentRowShell>
  );
}

/** Detailed: roomy rows with full meters, again only when there is data. */
export function DetailedRow(props: StudentRowProps) {
  const { student, checklistPct, attColor, doneColor, presenceStatus, isMobile, now, actions, selectMode, query } =
    props;
  const { stage, dormant } = stageOf(student);
  const showAttendance = student.attendance.total > 0;
  const showChecklist = student.checklist.total > 0;

  return (
    <StudentRowShell
      selectMode={selectMode}
      selected={props.selected}
      onToggleSelect={props.onToggleSelect}
      onOpen={props.onOpen}
      dormant={dormant}
      sx={{ p: 2, pr: 1, minHeight: 48, display: 'block' }}
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
            <Typography variant="body1" sx={{ fontWeight: 700, fontSize: { xs: '0.95rem', sm: '1rem' } }} noWrap>
              <RowName name={student.name} query={query} />
            </Typography>
            <StudentRowChips
              studyStage={student.study_stage}
              participationStatus={student.participation_status}
              dormantSince={student.dormant_since}
              dormantReason={student.dormant_reason}
              examBatch={student.exam_batch}
              pairStatus={student.pair_status}
              currentBatch={props.currentBatch}
              batchName={student.batch?.name}
              emailStatus={student.email_status}
              density="detailed"
            />
          </Box>
          {student.email && (
            <Typography variant="body2" color="text.secondary" noWrap>
              {student.email}
            </Typography>
          )}
          <StudentStatusLine student={student} now={now} />
        </Box>
        {!selectMode && actions}
      </Box>
      {(showAttendance || showChecklist) && (
        <Box sx={{ display: 'flex', gap: 2, mt: 1.25, ml: { xs: 0, sm: 7.5 }, pr: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          {showAttendance && <Meter label="Attendance" value={student.attendance.percentage} color={attColor} />}
          {showChecklist && <Meter label="Checklist" value={checklistPct} color={doneColor} />}
        </Box>
      )}
    </StudentRowShell>
  );
}
