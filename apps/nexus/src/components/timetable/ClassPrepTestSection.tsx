'use client';

import { useState } from 'react';
import { Box, Button, Chip, CircularProgress, Typography, alpha, useTheme } from '@neram/ui';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import type { ClassCardData } from './ClassCard';
import { RADIUS } from './timetable-theme';
import { useNexusSWR, useRefreshKey } from '@/lib/nexus-swr';

export interface PrepTestInfo {
  placement_id?: string;
  test_id: string;
  title: string;
  passing_pct: number;
  question_count: number;
  must_get_right: number;
  warning?: string;
  is_published?: boolean;
  /** After-class only. ISO, and soft: past it the paper is late, never shut. */
  due_at?: string | null;
  /** After-class only. False makes it a suggestion that blocks nothing. */
  required?: boolean;
}

export interface ClassTestRosterSummary {
  done: number;
  total: number;
}

/**
 * Which half of the class this section is about.
 *
 *   'before' is the prep test: pass it to unlock Join. No deadline, because the
 *   class start is the deadline, and the whole section hides its controls once
 *   the class has begun.
 *
 *   'after' is the class test: the work set in the class, with its own due date
 *   and its own reminders. It must stay settable AFTER the class has run, which
 *   is the normal path, so nothing here may key off has_started.
 */
export type ClassTestTiming = 'before' | 'after';

interface ClassPrepTestSectionProps {
  cls: ClassCardData;
  getToken: () => Promise<string | null>;
  /** Show Set / Remove. False renders a read-only line. */
  editable: boolean;
  /** Bump to force a refetch after the dialog saves. */
  refreshKey?: number;
  onSetTest?: (cls: ClassCardData) => void;
  onNotify?: (message: string, severity?: 'success' | 'error') => void;
  header?: React.ReactNode;
  /** Defaults to 'before', so every existing call site keeps its meaning. */
  timing?: ClassTestTiming;
}

/** "12 Aug", in IST, because a class at 9pm must not read as the next day. */
function formatDue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

/**
 * The test attached to one class, on either side of it.
 *
 * Sibling of ClassAssignmentsSection: the same rail, the other half of what a
 * student owes. Self-fetching, because the test is one row and threading it
 * through the panel's props would buy nothing.
 */
export default function ClassPrepTestSection({
  cls,
  getToken,
  editable,
  refreshKey,
  onSetTest,
  onNotify,
  header,
  timing = 'before',
}: ClassPrepTestSectionProps) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const after = timing === 'after';
  const endpoint = after ? 'class-test' : 'prep-test';

  const { data, isLoading, mutate } = useNexusSWR<{
    prep_test?: PrepTestInfo | null;
    class_test?: PrepTestInfo | null;
    has_started?: boolean;
    roster?: ClassTestRosterSummary | null;
  }>(cls?.id ? `/api/timetable/${cls.id}/${endpoint}` : null, getToken);
  useRefreshKey(refreshKey, mutate);

  const loading = isLoading;
  const test = (after ? data?.class_test : data?.prep_test) ?? null;
  const roster = after ? (data?.roster ?? null) : null;
  // A class test is set from the class you have just taught, so "has the class
  // started" is meaningless here. Only the prep test hides behind it.
  const hasStarted = after ? false : !!data?.has_started;

  const remove = async () => {
    setBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/timetable/${cls.id}/${endpoint}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await mutate(
          (current) => ({ ...current, ...(after ? { class_test: null } : { prep_test: null }) }),
          { revalidate: false },
        );
        // Says "removed from this class", not "deleted": the paper and every past
        // attempt survive, and a teacher who taps this by mistake loses nothing.
        onNotify?.('Test removed from this class');
      } else {
        const d = await res.json().catch(() => ({}));
        onNotify?.(d.error || 'Could not remove the test', 'error');
      }
    } catch {
      onNotify?.('Could not remove the test', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remind = async () => {
    setBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/timetable/${cls.id}/${endpoint}/nudge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        onNotify?.(d.error || 'Could not send the reminder', 'error');
        return;
      }
      const sent = d?.counts?.total ?? 0;
      onNotify?.(sent === 1 ? 'Reminded 1 student' : `Reminded ${sent} students`);
    } catch {
      onNotify?.('Could not send the reminder', 'error');
    } finally {
      setBusy(false);
    }
  };

  // A past class with no test says so, rather than rendering nothing.
  //
  // Returning null here was wrong in exactly the case that matters: on a database
  // where every class has already run, the section disappeared from every single
  // class and the feature read as "not shipped". "Feature missing" and "nothing
  // left to prepare for" must not look identical.

  return (
    <Box>
      {header}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={20} />
        </Box>
      ) : test ? (
        <>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.125,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: RADIUS.control,
              p: 1.375,
            }}
          >
            <Box
              sx={{
                width: 26,
                height: 26,
                borderRadius: 1,
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: alpha(theme.palette.warning.main, 0.14),
                color: 'warning.dark',
              }}
            >
              <QuizOutlinedIcon sx={{ fontSize: 15 }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.7813rem', lineHeight: 1.3 }} noWrap>
                {test.title}
              </Typography>
              {/* The count, not just the percentage. 80% of 6 is 5 of 6, and a
                  teacher reading only "80%" does not picture that. */}
              <Typography variant="caption" color="text.secondary">
                {test.question_count} question{test.question_count === 1 ? '' : 's'}, pass at{' '}
                {test.must_get_right} of {test.question_count}
              </Typography>
            </Box>
            {editable && !hasStarted && (
              <Button
                size="small"
                onClick={remove}
                disabled={busy}
                aria-label={`Remove ${test.title} from this class`}
                sx={{ minWidth: 40, minHeight: 40, color: 'text.disabled' }}
              >
                <LinkOffIcon fontSize="small" />
              </Button>
            )}
          </Box>

          {/* The two things that make an after-class test different from a prep
              test, said in the two words a teacher scans for. */}
          {after && (
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.875 }}>
              <Chip
                size="small"
                label={test.required === false ? 'Optional' : 'Required'}
                color={test.required === false ? 'default' : 'warning'}
                variant={test.required === false ? 'outlined' : 'filled'}
                sx={{ height: 22, fontWeight: 700 }}
              />
              {test.due_at && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={`Due ${formatDue(test.due_at)}`}
                  sx={{ height: 22 }}
                />
              )}
              {roster && roster.total > 0 && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={`${roster.done} of ${roster.total} done`}
                  color={roster.done === roster.total ? 'success' : 'default'}
                  sx={{ height: 22 }}
                />
              )}
            </Box>
          )}

          {test.warning && (
            <Typography
              variant="caption"
              sx={{ display: 'block', mt: 0.75, color: 'warning.dark', lineHeight: 1.4 }}
            >
              {test.warning}
            </Typography>
          )}

          {editable && !hasStarted && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.25 }}>
              <Button
                size="small"
                onClick={() => onSetTest?.(cls)}
                sx={{ textTransform: 'none', minHeight: 40, borderRadius: RADIUS.control }}
              >
                Change the test
              </Button>
              {/* Only offered while somebody still owes it. Chasing a class that
                  has all finished is the fastest way to teach students to mute
                  us. */}
              {after && roster && roster.done < roster.total && (
                <Button
                  size="small"
                  startIcon={<NotificationsActiveOutlinedIcon />}
                  onClick={remind}
                  disabled={busy}
                  sx={{ textTransform: 'none', minHeight: 40, borderRadius: RADIUS.control }}
                >
                  Remind {roster.total - roster.done}
                </Button>
              )}
            </Box>
          )}
        </>
      ) : editable ? (
        <Box
          sx={{
            border: `1px dashed ${theme.palette.divider}`,
            borderRadius: RADIUS.control,
            p: 1.5,
            textAlign: 'center',
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: hasStarted ? 0 : 1.125 }}>
            {after
              ? 'No test after this class'
              : hasStarted
                ? 'No test was set before this class'
                : 'No test before this class'}
          </Typography>
          {/* Past classes get the sentence and no button for the PREP test: there
              is genuinely nothing to set now, and an enabled control that always
              refuses is worse than no control. The after-class test has no such
              case, so its button is always live. */}
          {!hasStarted && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => onSetTest?.(cls)}
              sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
            >
              {after ? 'Set a test' : 'Set a short test'}
            </Button>
          )}
        </Box>
      ) : null}
    </Box>
  );
}
