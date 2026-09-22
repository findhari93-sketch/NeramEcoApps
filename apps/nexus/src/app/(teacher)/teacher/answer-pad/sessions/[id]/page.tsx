'use client';

/**
 * The Answer Pad report for one class: what was asked, how the class did on
 * each question, and each student's participation and score. The CSV comes from
 * the same answer as the tables, so the download and the screen always agree.
 *
 * A question whose answer the teacher left for later is settled here, after the
 * class: the answers the class gave are counted beside each choice, and once it
 * is revealed every score updates (scores are computed, never stored).
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { Alert, Box, Button, Chip, CircularProgress, ImageViewerDialog, Paper, Stack, Typography } from '@neram/ui';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import AnswerKeyPicker, { AnswerBars } from '@/components/answer-pad/AnswerKeyPicker';
import StudentAvatar from '@/components/students/StudentAvatar';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { downloadCsv } from '@/lib/csv-export';
import { answerTypeLabel, promptTitle, skipSummary } from '@/lib/pad/client/format';
import {
  REPORT_CSV_HEADERS,
  promptOutcome,
  reportCsvRows,
  reportErrorMessage,
  reportFilename,
  reportSkips,
  reportTotals,
  scorePercent,
  type ReportPrompt,
  type SessionReport,
} from '@/lib/pad/client/report';

/** What the teacher reads when setting an answer after class is refused. */
function settleMessage(code: string | null): string {
  switch (code) {
    case 'INVALID_TRANSITION':
      return 'That question has already been revealed. The report now shows it.';
    case 'KEY_REQUIRED':
      return 'Choose the correct answer, or mark it as a poll, before revealing.';
    case 'INVALID_KEY':
      return 'That is not a valid answer for this question.';
    case 'NOT_SESSION_TEACHER':
      return 'Only the teacher who ran this class can set its answers.';
    default:
      return 'The answer could not be saved. Please try again.';
  }
}

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
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ src: string; title: string } | null>(null);

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

  /** Set a key or reveal, then reload, so the tables show the server's numbers. */
  const settle = async (label: string, path: string, body?: unknown) => {
    setBusy(label);
    setSettleError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(path, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        setSettleError(settleMessage(typeof result.code === 'string' ? result.code : null));
      }
    } catch {
      setSettleError('No connection. Check your network and try again.');
    } finally {
      setBusy(null);
      await load();
    }
  };

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
  const settling: ReportPrompt | null = prompts.find((prompt) => prompt.id === settlingId && prompt.state === 'closed') ?? null;

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
        <Alert severity="info" icon={<ScheduleRounded />}>
          {totals.unrevealed === 1
            ? '1 question has no answer yet, so it is not graded. Set it below and every score updates.'
            : `${totals.unrevealed} questions have no answer yet, so they are not graded. Set them below and every score updates.`}
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
                    <Stack direction="row" spacing={1} alignItems="center">
                      {prompt.image_url && (
                        <Box
                          component="button"
                          type="button"
                          onClick={() => setViewing({ src: prompt.image_url as string, title: promptTitle(prompt) })}
                          aria-label={`Show the picture for ${promptTitle(prompt)}`}
                          sx={{
                            p: 0,
                            width: 44,
                            height: 44,
                            flexShrink: 0,
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 1,
                            overflow: 'hidden',
                            cursor: 'zoom-in',
                            bgcolor: 'background.paper',
                            '&:focus-visible': { outline: '3px solid', outlineOffset: 2 },
                          }}
                        >
                          <Box component="img" src={prompt.image_url} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        </Box>
                      )}
                      <span>{promptTitle(prompt)}</span>
                    </Stack>
                    {reportSkips(prompt) && (
                      <Typography variant="caption" color="text.secondary" component="span" sx={{ display: 'block', fontWeight: 400 }}>
                        {skipSummary(reportSkips(prompt))}
                      </Typography>
                    )}
                    {prompt.question_text && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        component="span"
                        sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontWeight: 400 }}
                      >
                        {prompt.question_text}
                      </Typography>
                    )}
                  </th>
                  <td>{answerTypeLabel(prompt.answer_type, prompt.option_count)}</td>
                  <td>
                    {prompt.state === 'closed' ? (
                      <Button
                        size="small"
                        variant={prompt.id === settlingId ? 'contained' : 'outlined'}
                        startIcon={<ScheduleRounded />}
                        onClick={() => setSettlingId(prompt.id === settlingId ? null : prompt.id)}
                        aria-expanded={prompt.id === settlingId}
                        aria-controls="pad-report-settle"
                        sx={{ minHeight: 40 }}
                      >
                        Set the answer
                      </Button>
                    ) : (
                      promptOutcome(prompt)
                    )}
                  </td>
                  <td className="num">{prompt.counts ? `${prompt.counts.answered} of ${prompt.counts.enrolled}` : ''}</td>
                  <td className="num">{prompt.counts && prompt.state === 'revealed' && !prompt.ungraded ? prompt.counts.correct : ''}</td>
                  <td className="num">{prompt.counts?.silent ?? ''}</td>
                  <td className="num">{prompt.counts?.absent ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        )}

        {settling && (
          <Paper id="pad-report-settle" variant="outlined" sx={{ p: 2, maxWidth: 520 }}>
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle1" component="h3" fontWeight={800}>
                  {`Set the answer for ${promptTitle(settling)}`}
                </Typography>
                {settling.question_text && (
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', mt: 0.5 }}>
                    {settling.question_text}
                  </Typography>
                )}
              </Box>
              {settling.image_url && (
                <Box
                  component="img"
                  src={settling.image_url}
                  alt={`Picture for ${promptTitle(settling)}`}
                  sx={{ width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}
                />
              )}
              {settleError && (
                <Alert severity="error" onClose={() => setSettleError(null)}>
                  {settleError}
                </Alert>
              )}
              <AnswerBars prompt={settling} groups={settling.groups ?? []} />
              <AnswerKeyPicker
                prompt={settling}
                groups={settling.groups ?? []}
                busy={busy}
                onKeys={(keys) => void settle('key', `/api/pad/prompts/${settling.id}/key`, { keys })}
                onPoll={() => void settle('key', `/api/pad/prompts/${settling.id}/key`, { ungraded: true })}
                onReveal={() => void settle('reveal', `/api/pad/prompts/${settling.id}/reveal`)}
              />
            </Stack>
          </Paper>
        )}
      </Stack>

      {viewing && (
        <ImageViewerDialog open onClose={() => setViewing(null)} src={viewing.src} alt={`Picture for ${viewing.title}`} name={viewing.title} />
      )}

      <Stack spacing={1.5} component="section" aria-labelledby="pad-report-students">
        <Typography variant="h6" component="h2" fontWeight={800} id="pad-report-students">
          Students
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The score counts revealed, graded questions a student was there for. Not answering while present counts as skipped.
          Questions a student was absent for, polls and questions still waiting for an answer are not graded.
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
