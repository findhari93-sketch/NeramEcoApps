'use client';

import { useCallback, useEffect, useState } from 'react';
import { Box, Button, CircularProgress, Typography, alpha, useTheme } from '@neram/ui';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import type { ClassCardData } from './ClassCard';
import { RADIUS } from './timetable-theme';

export interface PrepTestInfo {
  placement_id?: string;
  test_id: string;
  title: string;
  passing_pct: number;
  question_count: number;
  must_get_right: number;
  warning?: string;
  is_published?: boolean;
}

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
}

/**
 * The short test attached to one class.
 *
 * Sibling of ClassAssignmentsSection: the same rail, the other half of what a
 * student owes before the class. Self-fetching, because the prep test is one row
 * and threading it through the panel's props would buy nothing.
 *
 * Hidden entirely once the class has started. There is nothing left to prepare
 * for, and offering the control would only invite a teacher to lock a live class.
 */
export default function ClassPrepTestSection({
  cls,
  getToken,
  editable,
  refreshKey,
  onSetTest,
  onNotify,
  header,
}: ClassPrepTestSectionProps) {
  const theme = useTheme();
  const [prepTest, setPrepTest] = useState<PrepTestInfo | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!cls?.id) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/timetable/${cls.id}/prep-test`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setPrepTest(d.prep_test || null);
        setHasStarted(!!d.has_started);
      }
    } catch {
      /* the empty state covers this */
    } finally {
      setLoading(false);
    }
  }, [cls?.id, getToken]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const remove = async () => {
    setBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/timetable/${cls.id}/prep-test`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setPrepTest(null);
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

  // Nothing to say about a class that has already run and never had a test.
  if (hasStarted && !prepTest) return null;

  return (
    <Box>
      {header}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={20} />
        </Box>
      ) : prepTest ? (
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
                {prepTest.title}
              </Typography>
              {/* The count, not just the percentage. 80% of 6 is 5 of 6, and a
                  teacher reading only "80%" does not picture that. */}
              <Typography variant="caption" color="text.secondary">
                {prepTest.question_count} question{prepTest.question_count === 1 ? '' : 's'}, pass at{' '}
                {prepTest.must_get_right} of {prepTest.question_count}
              </Typography>
            </Box>
            {editable && !hasStarted && (
              <Button
                size="small"
                onClick={remove}
                disabled={busy}
                aria-label={`Remove ${prepTest.title} from this class`}
                sx={{ minWidth: 40, minHeight: 40, color: 'text.disabled' }}
              >
                <LinkOffIcon fontSize="small" />
              </Button>
            )}
          </Box>

          {prepTest.warning && (
            <Typography
              variant="caption"
              sx={{ display: 'block', mt: 0.75, color: 'warning.dark', lineHeight: 1.4 }}
            >
              {prepTest.warning}
            </Typography>
          )}

          {editable && !hasStarted && (
            <Button
              size="small"
              onClick={() => onSetTest?.(cls)}
              sx={{ textTransform: 'none', minHeight: 40, mt: 1.25, borderRadius: RADIUS.control }}
            >
              Change the test
            </Button>
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
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.125 }}>
            No test before this class
          </Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={() => onSetTest?.(cls)}
            sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
          >
            Set a short test
          </Button>
        </Box>
      ) : null}
    </Box>
  );
}
