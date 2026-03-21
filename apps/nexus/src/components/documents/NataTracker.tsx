'use client';

import { Box, Typography, Paper, alpha, useTheme } from '@neram/ui';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import AttemptCard from './AttemptCard';

interface ExamRegistration {
  id: string;
  exam_type: 'nata' | 'jee';
  is_writing: boolean;
  application_number: string | null;
  application_summary_doc_id: string | null;
}

interface ExamAttempt {
  id: string;
  exam_type: 'nata' | 'jee';
  phase: string;
  attempt_number: number;
  exam_date_id: string | null;
  state: 'planning' | 'applied' | 'completed' | 'scorecard_uploaded';
  application_date: string | null;
  exam_completed_at: string | null;
  aptitude_score: number | null;
  drawing_score: number | null;
  total_score: number | null;
}

interface ExamDate {
  id: string;
  exam_type: 'nata' | 'jee';
  year: number;
  phase: string;
  attempt_number: number;
  exam_date: string;
  label: string | null;
  registration_deadline: string | null;
}

interface NataTrackerProps {
  classroomId: string;
  getToken: () => Promise<string | null>;
  registration: ExamRegistration;
  attempts: ExamAttempt[];
  examDates: ExamDate[];
  onRefresh: () => void;
}

export default function NataTracker({
  classroomId,
  getToken,
  registration,
  attempts,
  examDates,
  onRefresh,
}: NataTrackerProps) {
  const theme = useTheme();

  const getAttempt = (phase: string, attemptNumber: number) =>
    attempts.find((a) => a.phase === phase && a.attempt_number === attemptNumber) || null;

  const getPhaseDates = (phase: string) =>
    examDates.filter((d) => d.exam_type === 'nata' && d.phase === phase);

  // Phase 2 is locked until at least one Phase 1 attempt is activated
  const phase1Attempts = attempts.filter((a) => a.phase === 'phase_1');
  const isPhase2Locked = phase1Attempts.length === 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Application Summary */}
      <Paper
        variant="outlined"
        sx={{ p: 2 }}
      >
        <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>
          Application Summary
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {registration.application_number
            ? `Application #${registration.application_number}`
            : 'Upload your NATA application summary after applying.'}
        </Typography>
        {registration.application_summary_doc_id ? (
          <Typography variant="caption" color="success.main" fontWeight={600}>
            Uploaded
          </Typography>
        ) : (
          <Typography variant="caption" color="text.disabled">
            Not uploaded yet
          </Typography>
        )}
      </Paper>

      {/* Phase 1 */}
      <Box>
        <Typography
          variant="body2"
          fontWeight={700}
          color="text.secondary"
          sx={{ mb: 1.5, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}
        >
          Phase 1
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <AttemptCard
            classroomId={classroomId}
            getToken={getToken}
            examType="nata"
            phase="phase_1"
            attemptNumber={1}
            attempt={getAttempt('phase_1', 1)}
            examDates={getPhaseDates('phase_1')}
            onRefresh={onRefresh}
          />
          <AttemptCard
            classroomId={classroomId}
            getToken={getToken}
            examType="nata"
            phase="phase_1"
            attemptNumber={2}
            attempt={getAttempt('phase_1', 2)}
            examDates={getPhaseDates('phase_1')}
            onRefresh={onRefresh}
          />
        </Box>
      </Box>

      {/* Phase 2 */}
      <Box>
        <Typography
          variant="body2"
          fontWeight={700}
          color="text.secondary"
          sx={{ mb: 1.5, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}
        >
          Phase 2
        </Typography>
        {isPhase2Locked ? (
          <Paper
            variant="outlined"
            sx={{
              p: 3,
              textAlign: 'center',
              opacity: 0.6,
              bgcolor: alpha(theme.palette.action.disabledBackground, 0.04),
            }}
          >
            <LockOutlinedIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2" color="text.disabled">
              Activate at least one Phase 1 attempt to unlock Phase 2
            </Typography>
          </Paper>
        ) : (
          <AttemptCard
            classroomId={classroomId}
            getToken={getToken}
            examType="nata"
            phase="phase_2"
            attemptNumber={1}
            attempt={getAttempt('phase_2', 1)}
            examDates={getPhaseDates('phase_2')}
            onRefresh={onRefresh}
          />
        )}
      </Box>
    </Box>
  );
}
