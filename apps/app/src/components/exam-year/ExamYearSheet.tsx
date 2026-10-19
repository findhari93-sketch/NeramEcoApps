'use client';

/**
 * "Which year will you write NATA or JEE B.Arch?"
 *
 * A one-question bottom sheet (a dialog from 600px up) for signed-in students
 * who have never told us their exam year. Most accounts only have a year the
 * CRM estimates from the sign-up date; one tap here replaces the guess.
 *
 * Shown only after phone verification and onboarding are done (StudentSession
 * mounts it there, so it never stacks on those), and only when /api/exam-year
 * says the prompt is due: no batch or stated year, and no snooze running.
 * "Later" and closing snooze it server-side (1 day, then weekly after two);
 * "Not sure yet" snoozes it for 30 days.
 *
 * In E2E test mode it stays hidden unless a test opts in with
 * localStorage 'neram_e2e_exam_year_sheet' = '1', so the other app specs are
 * not blocked by a sheet they do not expect.
 */

import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, ButtonBase, CircularProgress, Snackbar, Typography } from '@mui/material';
import { getFirebaseAuth } from '@neram/auth';
import { currentAcademicYear, examYearChoices, examYearFromAcademicYear } from '@neram/database';
import ResponsiveSheet from '@/components/support/ResponsiveSheet';

const SESSION_KEY = 'neram_exam_year_sheet_seen';
const E2E_OPT_IN_KEY = 'neram_e2e_exam_year_sheet';
const E2E_MODE = process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true';
/** Let the page paint before asking anything. */
const OPEN_DELAY_MS = 1200;

/** A short hint under each year, from the class a student would be in now. */
export function classHintFor(year: number, now: Date = new Date()): string | null {
  const cohortExamYear = examYearFromAcademicYear(currentAcademicYear(now));
  if (cohortExamYear === null) return null;
  const diff = year - cohortExamYear;
  if (diff < 0) return 'Finished Class 12';
  if (diff === 0) return 'Class 12 or a break year';
  if (diff === 1) return 'In Class 11 now';
  if (diff === 2) return 'In Class 10 now';
  if (diff === 3) return 'In Class 9 now';
  return null;
}

async function freshToken(fallback: string): Promise<string> {
  try {
    const u = getFirebaseAuth().currentUser;
    return u ? await u.getIdToken() : fallback;
  } catch {
    return fallback;
  }
}

function readFlag(storage: 'session' | 'local', key: string): string | null {
  try {
    return (storage === 'session' ? window.sessionStorage : window.localStorage).getItem(key);
  } catch {
    return null;
  }
}

function markSeen() {
  try {
    window.sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // Storage blocked: the server-side snooze still applies.
  }
}

export default function ExamYearSheet({ idToken }: { idToken: string }) {
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<number[]>(() => examYearChoices());
  const [picked, setPicked] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const checked = useRef(false);
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Radio group keys: arrows move the choice and the focus together.
  const onChipKeyDown = (e: React.KeyboardEvent, index: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + choices.length) % choices.length;
    setPicked(choices[next]);
    setError(null);
    chipRefs.current[next]?.focus();
  };

  // Track mount separately from the check. StudentSession hands over a new
  // idToken more than once while it registers the student (and dev Strict Mode
  // re-runs effects), so tying the cancel to the token would cancel the one
  // check that ever runs and the sheet would never open.
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (checked.current || !idToken) return;
    checked.current = true;
    if (E2E_MODE && readFlag('local', E2E_OPT_IN_KEY) !== '1') return;
    if (readFlag('session', SESSION_KEY) === '1') return;

    (async () => {
      try {
        const res = await fetch('/api/exam-year', {
          headers: { Authorization: `Bearer ${idToken}` },
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as { promptDue?: boolean; choices?: number[] };
        if (!mounted.current || !data.promptDue) return;
        if (Array.isArray(data.choices) && data.choices.length === 4) setChoices(data.choices);
        timer.current = setTimeout(() => {
          if (!mounted.current) return;
          markSeen();
          setOpen(true);
        }, OPEN_DELAY_MS);
      } catch {
        // Offline or a failed check: just do not ask this time.
      }
    })();
  }, [idToken]);

  const post = async (body: Record<string, unknown>) => {
    const token = await freshToken(idToken);
    return fetch('/api/exam-year', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  };

  const snooze = (action: 'later' | 'not_sure') => {
    setOpen(false);
    // Fire and forget: closing must feel instant. The session flag already
    // keeps the sheet away until the next visit if this request fails.
    post({ action }).catch(() => undefined);
    if (action === 'not_sure') setToast('No problem. We will check with you again in a month.');
  };

  const save = async () => {
    if (picked === null) return;
    setSaving(true);
    setError(null);
    try {
      const res = await post({ action: 'save', year: picked });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'We could not save that. Please try again.');
        return;
      }
      setOpen(false);
      setToast(`Saved. We will plan your preparation for ${picked}.`);
    } catch {
      setError('You seem to be offline. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ResponsiveSheet
        open={open}
        onClose={() => snooze('later')}
        busy={saving}
        title="Which year will you write NATA or JEE B.Arch?"
        actions={
          <>
            <Button
              variant="outlined"
              color="inherit"
              onClick={() => snooze('later')}
              disabled={saving}
              sx={{ minHeight: 48 }}
              data-testid="exam-year-later"
            >
              Later
            </Button>
            <Button
              variant="contained"
              onClick={save}
              disabled={picked === null || saving}
              sx={{ minHeight: 48 }}
              data-testid="exam-year-save"
              startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}
            >
              {saving ? 'Saving' : 'Save'}
            </Button>
          </>
        }
      >
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.5 }}>
          We use it to show the right timeline, mock tests and reminders for your exam.
        </Typography>

        <Box
          role="radiogroup"
          aria-label="Exam year"
          sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}
        >
          {choices.map((year, index) => {
            const selected = picked === year;
            const hint = classHintFor(year);
            // One tab stop for the group: the picked year, or the first one.
            const tabStop = picked === null ? index === 0 : selected;
            return (
              <ButtonBase
                key={year}
                ref={(el: HTMLButtonElement | null) => {
                  chipRefs.current[index] = el;
                }}
                role="radio"
                aria-checked={selected}
                tabIndex={tabStop ? 0 : -1}
                onKeyDown={(e) => onChipKeyDown(e, index)}
                onClick={() => {
                  setPicked(year);
                  setError(null);
                }}
                data-testid={`exam-year-chip-${year}`}
                focusRipple
                sx={{
                  minHeight: 64,
                  px: 1.5,
                  py: 1,
                  borderRadius: 2,
                  border: '2px solid',
                  borderColor: selected ? 'primary.main' : 'divider',
                  bgcolor: selected ? 'action.selected' : 'background.paper',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  textAlign: 'left',
                  transition: 'border-color 150ms ease, background-color 150ms ease',
                  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                  '&.Mui-focusVisible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                }}
              >
                <Typography component="span" sx={{ fontWeight: 700, fontSize: '1.125rem', color: 'text.primary' }}>
                  {year}
                </Typography>
                {hint && (
                  <Typography component="span" variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.3 }}>
                    {hint}
                  </Typography>
                )}
              </ButtonBase>
            );
          })}
        </Box>

        <Button
          variant="text"
          onClick={() => snooze('not_sure')}
          disabled={saving}
          fullWidth
          sx={{ mt: 1.5, minHeight: 48 }}
          data-testid="exam-year-not-sure"
        >
          Not sure yet
        </Button>

        {error && (
          <Alert severity="error" sx={{ mt: 1.5 }} role="alert">
            {error}
          </Alert>
        )}
      </ResponsiveSheet>

      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 'calc(80px + env(safe-area-inset-bottom, 0px))', sm: 24 } }}
      />
    </>
  );
}
