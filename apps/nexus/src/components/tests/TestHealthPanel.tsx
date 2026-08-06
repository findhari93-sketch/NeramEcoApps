'use client';

/**
 * What is wrong with this paper.
 *
 * Renders nothing at all when nothing is wrong, which is the common case and
 * should stay invisible. A permanent "0 issues" badge trains people to ignore
 * the space, and then the one time it matters they ignore it too.
 *
 * The three streams are labelled rather than merged, because what a teacher does
 * next differs by stream: a structural fault is fixed in the question bank, a
 * technical one is escalated, and a student report is answered.
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Chip, CircularProgress, Paper, Typography } from '@neram/ui';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import RecordVoiceOverOutlinedIcon from '@mui/icons-material/RecordVoiceOverOutlined';
import type { TestIssue, TestIssueStream } from '@/lib/test-health';

const STREAM_META: Record<TestIssueStream, { label: string; icon: React.ReactNode }> = {
  structural: { label: 'Paper', icon: <BuildOutlinedIcon sx={{ fontSize: 15 }} /> },
  technical: { label: 'App', icon: <BugReportOutlinedIcon sx={{ fontSize: 15 }} /> },
  reported: { label: 'Students', icon: <RecordVoiceOverOutlinedIcon sx={{ fontSize: 15 }} /> },
};

interface ReportRow {
  id: string;
  question_id: string;
  report_type: string | null;
  description: string | null;
  created_at: string;
}

const REPORT_LABEL: Record<string, string> = {
  wrong_answer: 'Answer looks wrong',
  no_correct_option: 'No correct option',
  question_error: 'Mistake in the question',
  missing_solution: 'No solution given',
  unclear_question: 'Question is unclear',
  other: 'Other',
};

export default function TestHealthPanel({
  testId,
  getToken,
}: {
  testId: string;
  getToken: () => Promise<string | null>;
}) {
  const [issues, setIssues] = useState<TestIssue[] | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [blocking, setBlocking] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/question-bank/tests/${testId}/health`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('health check failed');
      const json = await res.json();
      setIssues(json.data?.issues || []);
      setReports(json.data?.reports || []);
      setBlocking(Boolean(json.data?.blocking));
    } catch {
      // Said out loud rather than swallowed. A silent failure here reads as
      // "this paper is fine", which is the one wrong answer this panel can give.
      setFailed(true);
      setIssues([]);
    }
  }, [testId, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  if (issues === null) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
        <CircularProgress size={14} />
        <Typography variant="caption" color="text.secondary">
          Checking this paper
        </Typography>
      </Box>
    );
  }

  if (failed) {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        Could not check this paper for problems. This does not mean it is fine, only that the check
        did not run.
      </Alert>
    );
  }

  // Nothing wrong: render nothing. See the file comment.
  if (issues.length === 0) return null;

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        mb: 2,
        borderRadius: 2,
        borderColor: blocking ? 'error.main' : 'warning.main',
        borderWidth: 1.5,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <ReportProblemOutlinedIcon sx={{ fontSize: 20, color: blocking ? 'error.main' : 'warning.main' }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {blocking ? 'This paper has problems that affect students sitting it' : 'Worth a look'}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {issues.map((issue, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <Chip
              size="small"
              icon={STREAM_META[issue.stream].icon as any}
              label={STREAM_META[issue.stream].label}
              color={issue.severity === 'error' ? 'error' : 'warning'}
              variant="outlined"
              sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, flexShrink: 0 }}
            />
            <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
              {issue.title}
            </Typography>
          </Box>
        ))}
      </Box>

      {reports.length > 0 && (
        <Box sx={{ mt: 2, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.75 }}>
            What students said
          </Typography>
          {/* Verbatim. A tally tells a teacher there is a problem; the sentence
              tells them what it is, and these have been sitting unread because
              the only surface for them was a page nothing links to. */}
          {reports.slice(0, 5).map((r) => (
            <Box key={r.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mb: 0.5 }}>
              <Chip
                size="small"
                label={REPORT_LABEL[r.report_type || 'other'] || 'Other'}
                variant="outlined"
                sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700, flexShrink: 0 }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>
                {r.description?.trim() || 'No detail given'}
              </Typography>
            </Box>
          ))}
          {reports.length > 5 && (
            <Typography variant="caption" color="text.secondary">
              and {reports.length - 5} more
            </Typography>
          )}
        </Box>
      )}
    </Paper>
  );
}
