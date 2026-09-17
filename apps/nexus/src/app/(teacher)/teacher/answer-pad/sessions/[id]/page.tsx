'use client';

/**
 * The Answer Pad report for one class: what was asked, how the class did on
 * each question, and each student's participation and score. The CSV comes from
 * the same answer as the tables, so the download and the screen always agree.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from '@neram/ui';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import StudentAvatar from '@/components/students/StudentAvatar';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { downloadCsv } from '@/lib/csv-export';
import { answerTypeLabel } from '@/lib/pad/client/format';
import {
  REPORT_CSV_HEADERS,
  promptOutcome,
  reportCsvRows,
  reportErrorMessage,
  reportFilename,
  reportTotals,
  scorePercent,
  type SessionReport,
} from '@/lib/pad/client/report';

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
}

const hiddenCaption = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

function TableFrame({ caption, minWidth, children }: { caption: string; minWidth: number; children: ReactNode }) {
  return (
    <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
      <Box
        component="table"
        sx={{
          width: '100%',
          minWidth,
          borderCollapse: 'collapse',
          '& th, & td': {
            px: 1.5,
            py: 1.25,
            textAlign: 'left',
            borderBottom: '1px solid',
            borderColor: 'divider',
            fontSize: '0.875rem',
            whiteSpace: 'nowrap',
          },
          '& th': { fontWeight: 700, color: 'text.secondary', bgcolor: 'action.hover' },
          '& .num': { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
          '& .wrap': { whiteSpace: 'normal', minWidth: 140 },
          '& tbody tr:last-of-type td': { borderBottom: 0 },
        }}
      >
        <Box component="caption" sx={hiddenCaption}>
          {caption}
        </Box>
        {children}
      </Box>
    </Box>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Stack spacing={0.25} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5" component="p" fontWeight={800} sx={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
    </Stack>
  );
}

export default function AnswerPadReportPage() {
  const { id } = useParams<{ id: string }>();
  const { getToken, tokenReady } = useNexusAuthContext();
  const [report, setReport] = useState<SessionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/pad/sessions/${id}/report`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(reportErrorMessage(res.status, typeof body.code === 'string' ? body.code : null));
        return;
      }
      setReport(body as SessionReport);
      setError(null);
    } catch {
      setError('The report could not load. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [id, getToken]);

  useEffect(() => {
    if (tokenReady) void load();
  }, [tokenReady, load]);

  if (!report) {
    return loading ? (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress aria-label="Loading the report" />
      </Box>
    ) : (
      <Alert severity="error">{error ?? 'The report could not load. Please try again.'}</Alert>
    );
  }

  const { session, prompts, students } = report;
  const totals = reportTotals(report);
  const live = session.status === 'live';

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" component="h1" fontWeight={800}>
            Answer Pad report
          </Typography>
          <Typography color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
            {`${session.classroom_name ?? 'Class'}, ${formatWhen(session.created_at)}`}
          </Typography>
          <Chip
            size="small"
            sx={{ mt: 1 }}
            color={live ? 'success' : 'default'}
            label={live ? 'Class still running' : session.ended_at ? `Ended ${formatWhen(session.ended_at)}` : 'Ended'}
          />
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          {live && (
            <Button variant="text" startIcon={<RefreshRounded />} onClick={() => load()} disabled={loading} sx={{ minHeight: 44 }}>
              Refresh
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={<DownloadRounded />}
            onClick={() => downloadCsv(reportFilename(report), REPORT_CSV_HEADERS, reportCsvRows(report))}
            disabled={students.length === 0}
            sx={{ minHeight: 44 }}
          >
            Download CSV
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="warning">{error}</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5 }}>
        <Stat label="Questions asked" value={totals.asked} />
        <Stat label="Graded" value={totals.graded} />
        <Stat label="Polls" value={totals.polls} />
        <Stat label="Class score" value={totals.classScore || 'No score yet'} />
      </Box>

      {totals.unrevealed > 0 && (
        <Alert severity="info">
          {totals.unrevealed === 1
            ? '1 question was never revealed, so it is not graded.'
            : `${totals.unrevealed} questions were never revealed, so they are not graded.`}
        </Alert>
      )}

      <Stack spacing={1.5} component="section" aria-labelledby="pad-report-questions">
        <Typography variant="h6" component="h2" fontWeight={800} id="pad-report-questions">
          Questions
        </Typography>
        {prompts.length === 0 ? (
          <Typography color="text.secondary">No questions were asked in this class.</Typography>
        ) : (
          <TableFrame caption="Each question, its answer and how the class responded" minWidth={640}>
            <thead>
              <tr>
                <th scope="col">Question</th>
                <th scope="col">Type</th>
                <th scope="col">Answer</th>
                <th scope="col" className="num">
                  Answered
                </th>
                <th scope="col" className="num">
                  Correct
                </th>
                <th scope="col" className="num">
                  Present but silent
                </th>
                <th scope="col" className="num">
                  Absent
                </th>
              </tr>
            </thead>
            <tbody>
              {prompts.map((prompt) => (
                <tr key={prompt.id}>
                  <th scope="row" className="wrap">
                    {`Q${prompt.sequence}${prompt.label ? ` ${prompt.label}` : ''}`}
                  </th>
                  <td>{answerTypeLabel(prompt.answer_type, prompt.option_count)}</td>
                  <td>{promptOutcome(prompt)}</td>
                  <td className="num">{prompt.counts ? `${prompt.counts.answered} of ${prompt.counts.enrolled}` : ''}</td>
                  <td className="num">{prompt.counts && prompt.state === 'revealed' && !prompt.ungraded ? prompt.counts.correct : ''}</td>
                  <td className="num">{prompt.counts?.silent ?? ''}</td>
                  <td className="num">{prompt.counts?.absent ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        )}
      </Stack>

      <Stack spacing={1.5} component="section" aria-labelledby="pad-report-students">
        <Typography variant="h6" component="h2" fontWeight={800} id="pad-report-students">
          Students
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The score counts revealed, graded questions a student was there for. Not answering while present counts as skipped.
          Questions a student was absent for, polls and questions that were never revealed are not graded.
        </Typography>
        {students.length === 0 ? (
          <Typography color="text.secondary">There is nobody on the class list for this class.</Typography>
        ) : (
          <TableFrame caption="Each student's participation and score" minWidth={720}>
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col" className="num">
                  Score
                </th>
                <th scope="col" className="num">
                  Correct
                </th>
                <th scope="col" className="num">
                  Wrong
                </th>
                <th scope="col" className="num">
                  Skipped
                </th>
                <th scope="col" className="num">
                  Answered
                </th>
                <th scope="col" className="num">
                  Absent
                </th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.student_id}>
                  <th scope="row" className="wrap">
                    <Stack direction="row" spacing={1} alignItems="center">
                      <StudentAvatar userId={student.student_id} name={student.name ?? ''} size={32} sx={{ flexShrink: 0 }} />
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ minWidth: 0 }}>
                        <span>{student.name ?? 'Unnamed student'}</span>
                        {!student.on_roster && <Chip size="small" variant="outlined" label="Not on class list" />}
                      </Stack>
                    </Stack>
                  </th>
                  <td className="num">{scorePercent(student) || 'No score'}</td>
                  <td className="num">{student.correct}</td>
                  <td className="num">{student.wrong}</td>
                  <td className="num">{student.skipped}</td>
                  <td className="num">{student.answered}</td>
                  <td className="num">{student.absent}</td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        )}
      </Stack>
    </Stack>
  );
}
