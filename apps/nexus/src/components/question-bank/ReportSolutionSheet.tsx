'use client';

/**
 * "Something is wrong with this solution."
 *
 * Two short steps: which part (skipped when the student pressed the link under
 * that part), then why. A list of reasons rather than a text box, because a
 * teacher fixing it needs to know what to change, and "the working is wrong"
 * and "it is for another question" are different fixes. The note stays
 * optional except for "Something else": a student at ten at night will not
 * write an essay, and requiring one means nobody reports anything.
 *
 * NO DISABLED SEND, the house rule from ResultLooksWrongSheet: pressing Send
 * too early says what is missing beside the thing that is missing.
 */
import { useEffect, useState } from 'react';
import { Box, Button, Stack, TextField, Typography, alpha, useTheme } from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ResponsiveSheet from '@/components/study-materials/recordings/ResponsiveSheet';
import {
  QB_REPORT_REASONS_BY_TARGET,
  type QBReportSource,
  type QBReportTarget,
  type QBReportType,
} from '@neram/database';
import { parseVideoTime } from '@/lib/video-time';
import type { ReportTargetOption } from '@/lib/report-targets';

const NOTE_LIMIT = 500;

export interface ReportSent {
  target: QBReportTarget;
  partLabel: string | null;
  reason: QBReportType;
}

export interface ReportSolutionSheetProps {
  open: boolean;
  onClose: () => void;
  questionId: string;
  /** What this question has, from reportTargetsFor. */
  targets: ReportTargetOption[];
  /** The part the student came from, which skips the first step. */
  initialTarget?: { target: QBReportTarget; partLabel: string | null } | null;
  /** Only a question with options offers "none of the options is right". */
  isMcq: boolean;
  source: QBReportSource;
  testId?: string | null;
  getToken: () => Promise<string | null>;
  onSent?: (sent: ReportSent) => void;
}

type Outcome = { kind: 'sent' } | { kind: 'already' };

export default function ReportSolutionSheet({
  open,
  onClose,
  questionId,
  targets,
  initialTarget = null,
  isMcq,
  source,
  testId = null,
  getToken,
  onSent,
}: ReportSolutionSheetProps) {
  const theme = useTheme();
  const initial = initialTarget
    ? targets.find((t) => t.target === initialTarget.target && t.partLabel === initialTarget.partLabel) ?? null
    : targets.length === 1
      ? targets[0]
      : null;

  const [chosen, setChosen] = useState<ReportTargetOption | null>(initial);
  const [reason, setReason] = useState<QBReportType | null>(null);
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [missing, setMissing] = useState<'reason' | 'note' | 'time' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  // A fresh sheet every time it opens, starting from wherever it was opened.
  useEffect(() => {
    if (!open) return;
    setChosen(initial);
    setReason(null);
    setTime('');
    setNote('');
    setMissing(null);
    setError(null);
    setOutcome(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const reasons = chosen
    ? QB_REPORT_REASONS_BY_TARGET[chosen.target].filter((r) => isMcq || !r.mcqOnly)
    : [];

  const send = async () => {
    if (!chosen) return;
    if (!reason) return setMissing('reason');
    const seconds = chosen.target === 'video' ? parseVideoTime(time) : null;
    if (seconds === undefined) return setMissing('time');
    if (reason === 'other' && !note.trim()) return setMissing('note');
    setMissing(null);
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/question-bank/questions/${questionId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          target: chosen.target,
          reason,
          note: note.trim(),
          video_seconds: seconds ?? null,
          part_label: chosen.partLabel,
          source,
          test_id: testId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || 'That did not send. Try again in a moment.');
        return;
      }
      setOutcome(json?.already_open ? { kind: 'already' } : { kind: 'sent' });
      onSent?.({ target: chosen.target, partLabel: chosen.partLabel, reason });
    } catch {
      setError('That did not send. Check the connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const rowSx = (selected: boolean) => ({
    textAlign: 'left' as const,
    width: '100%',
    minHeight: 48,
    px: 1.75,
    py: 1.25,
    cursor: 'pointer',
    borderRadius: 1.5,
    fontFamily: 'inherit',
    color: 'inherit',
    bgcolor: selected ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
    border: `1px solid ${selected ? theme.palette.primary.main : alpha(theme.palette.text.primary, 0.15)}`,
    transition: theme.transitions.create(['background-color', 'border-color'], { duration: 180 }),
    '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
    '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
  });

  const title = outcome
    ? outcome.kind === 'already'
      ? 'You already reported this'
      : 'Thanks for telling us'
    : chosen
      ? 'What is wrong with it?'
      : 'What looks wrong?';

  return (
    <ResponsiveSheet
      open={open}
      onClose={onClose}
      disableClose={busy}
      maxWidth="xs"
      title={title}
      description={
        outcome
          ? undefined
          : chosen
            ? chosen.label
            : 'Choose the part of this question that has the mistake.'
      }
      actions={
        outcome ? (
          <Button variant="contained" onClick={onClose} sx={{ textTransform: 'none' }}>
            Done
          </Button>
        ) : chosen ? (
          <>
            <Button onClick={onClose} disabled={busy} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button variant="contained" onClick={send} disabled={busy} sx={{ textTransform: 'none' }}>
              {busy ? 'Sending' : 'Send'}
            </Button>
          </>
        ) : undefined
      }
    >
      {outcome ? (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', py: 1 }}>
          <CheckCircleIcon aria-hidden sx={{ color: 'success.dark', mt: 0.25 }} />
          <Box>
            <Typography variant="body2">
              {outcome.kind === 'already'
                ? 'A teacher is already checking it. We will tell you what they find.'
                : 'A teacher will check it, and we will tell you what they find.'}
            </Typography>
            <Button
              href="/student/question-bank/reports"
              size="small"
              sx={{ mt: 0.5, ml: -1, minHeight: 44, textTransform: 'none' }}
            >
              See my reports
            </Button>
          </Box>
        </Box>
      ) : !chosen ? (
        <Stack spacing={1} sx={{ pb: 1 }}>
          {targets.map((t) => (
            <Box
              key={`${t.target}|${t.partLabel ?? ''}`}
              component="button"
              type="button"
              onClick={() => setChosen(t)}
              sx={rowSx(false)}
            >
              <Typography variant="body2" fontWeight={600}>
                {t.label}
              </Typography>
            </Box>
          ))}
        </Stack>
      ) : (
        <Box sx={{ pb: 1 }}>
          {targets.length > 1 && (
            <Button
              onClick={() => {
                setChosen(null);
                setReason(null);
                setMissing(null);
              }}
              size="small"
              sx={{ ml: -1, mb: 1, minHeight: 44, textTransform: 'none' }}
            >
              Change
            </Button>
          )}

          <Stack spacing={1} role="group" aria-label="Why it is wrong">
            {reasons.map((r) => {
              const selected = reason === r.reason;
              return (
                <Box
                  key={r.reason}
                  component="button"
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setReason(r.reason);
                    if (missing === 'reason') setMissing(null);
                  }}
                  sx={rowSx(selected)}
                >
                  <Typography variant="body2" sx={{ fontWeight: selected ? 700 : 600, lineHeight: 1.35 }}>
                    {r.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {r.hint}
                  </Typography>
                </Box>
              );
            })}
          </Stack>
          {missing === 'reason' && (
            <Typography variant="caption" color="error.main" component="p" sx={{ mt: 0.75, mb: 0 }}>
              Choose what is wrong
            </Typography>
          )}

          {chosen.target === 'video' && (
            <TextField
              fullWidth
              size="small"
              label="Where in the video? (optional, for example 2:15)"
              value={time}
              onChange={(e) => {
                setTime(e.target.value.slice(0, 8));
                if (missing === 'time') setMissing(null);
              }}
              error={missing === 'time'}
              helperText={missing === 'time' ? 'Write the time like 2:15' : ' '}
              inputProps={{ inputMode: 'numeric', sx: { fontSize: { xs: 16, sm: 14 } } }}
              sx={{ mt: 2 }}
            />
          )}

          <TextField
            fullWidth
            multiline
            minRows={2}
            size="small"
            label={reason === 'other' ? 'What looks wrong?' : 'Anything else? (optional)'}
            value={note}
            onChange={(e) => {
              setNote(e.target.value.slice(0, NOTE_LIMIT));
              if (missing === 'note') setMissing(null);
            }}
            error={missing === 'note'}
            helperText={missing === 'note' ? 'Tell us what looks wrong' : ' '}
            inputProps={{ sx: { fontSize: { xs: 16, sm: 14 } } }}
            sx={{ mt: chosen.target === 'video' ? 0.5 : 2 }}
          />

          {error && (
            <Typography role="alert" variant="body2" color="error.main" sx={{ mt: 0.5 }}>
              {error}
            </Typography>
          )}
        </Box>
      )}
    </ResponsiveSheet>
  );
}
