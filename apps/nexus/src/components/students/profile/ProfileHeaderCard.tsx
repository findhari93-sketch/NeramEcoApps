'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import StudentStageAvatar from '@/components/students/StudentStageAvatar';
import ExamYearChip from '@/components/students/ExamYearChip';
import { DormantChip, StudentStageChip } from '@/components/students/StudentStageChip';
import ViewAsStudentButton from '@/components/ViewAsStudentButton';
import { stageKeyOf } from '@/lib/student-stage';
import { formatDateIN } from '@/lib/student-profile-fields';
import { expectedYearForStage } from '@neram/database';
import type {
  ProfileEnrollment,
  ProfileStudent,
  ProfileStudentRecord,
} from '@/lib/student-profile-types';

/**
 * Who this student is, at a glance, plus the three actions a teacher takes.
 *
 * On mobile the actions collapse into a kebab menu. Three stacked 48px buttons
 * would push the first section below the fold on a 375x812 screen, so the page
 * would open on nothing but chrome.
 *
 * On desktop this is the sticky left rail, so it stays on screen while the
 * section stack scrolls beside it.
 */
export default function ProfileHeaderCard({
  student,
  enrollment,
  record,
  applicationNumber,
  currentBatch,
  canSetStage,
  canSetDormancy,
  onEditStage,
  onToggleDormancy,
}: {
  student: ProfileStudent;
  enrollment: ProfileEnrollment;
  record: ProfileStudentRecord | null;
  applicationNumber: string | null;
  currentBatch: string | null;
  canSetStage: boolean;
  canSetDormancy: boolean;
  onEditStage: () => void;
  onToggleDormancy: () => void;
}) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [menuEl, setMenuEl] = useState<null | HTMLElement>(null);

  const stage = stageKeyOf(enrollment.study_stage);
  const dormant = enrollment.participation_status === 'dormant';

  const chips = (
    <Box
      sx={{
        display: 'flex',
        gap: 0.75,
        flexWrap: 'wrap',
        mt: 1,
        justifyContent: isDesktop ? 'center' : 'flex-start',
      }}
    >
      <StudentStageChip stage={stage} density="detailed" />
      <ExamYearChip
        academicYear={student.academic_year}
        pairStatus={enrollment.pair_status}
        studyStage={enrollment.study_stage}
        expectedYear={currentBatch ? expectedYearForStage(stage, currentBatch) : null}
        density="detailed"
      />
      {dormant && (
        <DormantChip
          since={enrollment.dormant_since}
          reason={enrollment.dormant_reason}
          density="detailed"
        />
      )}
    </Box>
  );

  const identifiers = [
    record?.student_id ? `Roll ${record.student_id}` : null,
    applicationNumber ? `Application ${applicationNumber}` : null,
    enrollment.enrolled_at ? `Enrolled ${formatDateIN(enrollment.enrolled_at)}` : null,
  ].filter(Boolean);

  // ── Desktop: the sticky rail ──────────────────────────────────────────────
  if (isDesktop) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
          <StudentStageAvatar
            stage={stage}
            dormant={dormant}
            src={student.avatar_url}
            name={student.name || ''}
            size={96}
          />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 800, wordBreak: 'break-word' }}>
          {student.name}
        </Typography>
        {student.email && (
          <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
            {student.email}
          </Typography>
        )}
        {chips}

        {!student.academic_year && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            No exam year set, so this student belongs to no cohort.
          </Typography>
        )}

        {identifiers.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            {identifiers.join(' . ')}
          </Typography>
        )}

        <Box sx={{ display: 'grid', gap: 1, mt: 2.5 }}>
          <ViewAsStudentButton
            studentId={student.id}
            reason={`Student profile: ${student.name}`}
            variant="contained"
          />
          {canSetStage && (
            <Button
              variant="outlined"
              startIcon={<EditOutlinedIcon />}
              onClick={onEditStage}
              sx={{ minHeight: 48, fontWeight: 700 }}
            >
              Edit class and exam year
            </Button>
          )}
          {canSetDormancy && (
            <Button
              variant="outlined"
              color={dormant ? 'success' : 'warning'}
              onClick={onToggleDormancy}
              sx={{ minHeight: 48, fontWeight: 700 }}
            >
              {dormant ? 'Bring back' : 'Mark dormant'}
            </Button>
          )}
        </Box>
      </Paper>
    );
  }

  // ── Mobile: compact, sticky, actions in a kebab ───────────────────────────
  return (
    <Paper
      sx={{
        p: 2,
        mb: 2,
        position: 'sticky',
        top: 0,
        zIndex: 2,
      }}
    >
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
        <StudentStageAvatar
          stage={stage}
          dormant={dormant}
          src={student.avatar_url}
          name={student.name || ''}
          size={48}
        />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 800, wordBreak: 'break-word' }}>
            {student.name}
          </Typography>
          {student.email && (
            <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
              {student.email}
            </Typography>
          )}
        </Box>
        <IconButton
          onClick={(e) => setMenuEl(e.currentTarget)}
          aria-label="Student actions"
          sx={{ width: 48, height: 48, flexShrink: 0 }}
        >
          <MoreVertIcon />
        </IconButton>
      </Box>

      {chips}

      {identifiers.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {identifiers.join(' . ')}
        </Typography>
      )}

      <Menu anchorEl={menuEl} open={!!menuEl} onClose={() => setMenuEl(null)}>
        <MenuItem sx={{ minHeight: 48 }} onClick={() => setMenuEl(null)} disableRipple>
          <ViewAsStudentButton
            studentId={student.id}
            reason={`Student profile: ${student.name}`}
            variant="text"
          />
        </MenuItem>
        {canSetStage && (
          <MenuItem
            sx={{ minHeight: 48 }}
            onClick={() => {
              setMenuEl(null);
              onEditStage();
            }}
          >
            Edit class and exam year
          </MenuItem>
        )}
        {canSetDormancy && (
          <MenuItem
            sx={{ minHeight: 48 }}
            onClick={() => {
              setMenuEl(null);
              onToggleDormancy();
            }}
          >
            {dormant ? 'Bring back' : 'Mark dormant'}
          </MenuItem>
        )}
      </Menu>
    </Paper>
  );
}
