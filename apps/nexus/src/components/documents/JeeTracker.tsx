'use client';

import { Box, Typography, Paper } from '@neram/ui';
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

interface JeeTrackerProps {
  classroomId: string;
  getToken: () => Promise<string | null>;
  registration: ExamRegistration;
  attempts: ExamAttempt[];
  examDates: ExamDate[];
  onRefresh: () => void;
}

export default function JeeTracker({
  classroomId,
  getToken,
  registration,
  attempts,
  examDates,
  onRefresh,
}: JeeTrackerProps) {
  const getAttempt = (phase: string, attemptNumber: number) =>
    attempts.find((a) => a.phase === phase && a.attempt_number === attemptNumber) || null;

  const getSessionDates = (session: string) =>
    examDates.filter((d) => d.exam_type === 'jee' && d.phase === session);

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
            : 'Upload your JEE application summary after applying.'}
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

      {/* Session 1 */}
      <Box>
        <Typography
          variant="body2"
          fontWeight={700}
          color="text.secondary"
          sx={{ mb: 1.5, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}
        >
          Session 1
        </Typography>
        <AttemptCard
          classroomId={classroomId}
          getToken={getToken}
          examType="jee"
          phase="session_1"
          attemptNumber={1}
          attempt={getAttempt('session_1', 1)}
          examDates={getSessionDates('session_1')}
          onRefresh={onRefresh}
        />
      </Box>

      {/* Session 2 */}
      <Box>
        <Typography
          variant="body2"
          fontWeight={700}
          color="text.secondary"
          sx={{ mb: 1.5, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}
        >
          Session 2 (Optional)
        </Typography>
        <AttemptCard
          classroomId={classroomId}
          getToken={getToken}
          examType="jee"
          phase="session_2"
          attemptNumber={1}
          attempt={getAttempt('session_2', 1)}
          examDates={getSessionDates('session_2')}
          onRefresh={onRefresh}
        />
      </Box>
    </Box>
  );
}
