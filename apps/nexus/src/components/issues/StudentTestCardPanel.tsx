'use client';

/**
 * What this student's tests page says to THEM, right now, read from a ticket.
 *
 * A student reports that a test says Closed when they were told it would open
 * once they finished a recording. Until this existed, checking that meant
 * watching the whole recording as them, or impersonating them for an hour, and
 * in practice it meant neither: NXS-0125 sat open for eight days because
 * nobody could tell whether it was still broken.
 *
 * The sentences below are not a second opinion about the student's state. They
 * come from /api/student/tests/overview with ?as_student=, which is the same
 * route, the same facts and the same resolveStudentTestCard the student's own
 * page renders. If it disagreed with what she sees, it would be worse than
 * nothing.
 */

import React, { useCallback, useState } from 'react';
import { Box, Button, Chip, Collapse, Skeleton, Typography, alpha, useTheme } from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface CardShape {
  state: string;
  reason: string;
  tone: 'urgent' | 'attention' | 'neutral' | 'positive';
  window: { opens_at: string | null; closes_at: string | null; source: string };
  attempts_here: number;
  attempts_left: number | null;
}

interface TestItem {
  id: string;
  title: string;
  is_exam?: boolean;
  card?: CardShape | null;
  catchup_gate?: { blocked: boolean; outstanding: Array<{ id: string; title: string | null; date: string }> } | null;
}

/** The state word, in the student's own vocabulary. */
const STATE_LABELS: Record<string, string> = {
  open: 'Open',
  reopened: 'Open for her',
  upcoming: 'Opens later',
  locked: 'Locked',
  awaiting_teacher: 'Waiting on a teacher',
  closed: 'Closed',
  missed: 'Missed',
  done: 'Done',
};

const TONE_COLOR: Record<string, 'error' | 'warning' | 'default' | 'success'> = {
  urgent: 'error',
  attention: 'warning',
  neutral: 'default',
  positive: 'success',
};

function shortDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

export interface StudentTestCardPanelProps {
  studentId: string;
  /** Only the first name, so the heading reads like a sentence. */
  firstName: string;
}

export default function StudentTestCardPanel({ studentId, firstName }: StudentTestCardPanelProps) {
  const theme = useTheme();
  const { getToken } = useNexusAuthContext();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tests, setTests] = useState<TestItem[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/student/tests/overview?as_student=${encodeURIComponent(studentId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error('load failed');
      const body = await res.json();
      const all = (body?.data?.all || []) as TestItem[];
      const exams = (body?.data?.exams || []) as TestItem[];
      // Exams first, then everything else, deduplicated by id: an exam is the
      // thing most likely to be under dispute.
      const seen = new Set<string>();
      const merged = [...exams, ...all].filter((t) => {
        if (!t?.id || seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });
      setTests(merged);
    } catch {
      setError('Could not load her tests.');
    } finally {
      setLoading(false);
    }
  }, [getToken, studentId]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    // Fetched on first expand only. Collapsed is the default because this is a
    // second opinion on a ticket, not the ticket.
    if (next && tests === null && !loading) void load();
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Button
        onClick={toggle}
        fullWidth
        aria-expanded={open}
        startIcon={<VisibilityOutlinedIcon sx={{ fontSize: '1.1rem' }} />}
        endIcon={
          <ExpandMoreIcon
            sx={{
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 200ms',
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          />
        }
        sx={{
          justifyContent: 'space-between',
          textTransform: 'none',
          fontWeight: 600,
          minHeight: 44,
          px: 1.5,
          borderRadius: 2,
          border: 1,
          borderColor: 'divider',
          color: 'text.primary',
          '& .MuiButton-startIcon': { mr: 1 },
        }}
      >
        <Box component="span" sx={{ flex: 1, textAlign: 'left' }}>
          How it looks for {firstName} right now
        </Box>
      </Button>

      <Collapse in={open} unmountOnExit>
        <Box sx={{ pt: 1.5 }}>
          {loading && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }} aria-busy="true">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} variant="rectangular" height={64} sx={{ borderRadius: 1.5 }} />
              ))}
            </Box>
          )}

          {!loading && error && (
            <Box sx={{ p: 1.5, borderRadius: 2, border: 1, borderColor: 'divider' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                {error}
              </Typography>
              <Button size="small" onClick={() => void load()} sx={{ textTransform: 'none', minHeight: 44 }}>
                Try again
              </Button>
            </Box>
          )}

          {!loading && !error && tests !== null && tests.length === 0 && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              No tests are set for her right now.
            </Typography>
          )}

          {!loading && !error && tests !== null && tests.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {tests.map((t) => {
                const card = t.card;
                const blocked = t.catchup_gate?.blocked ? t.catchup_gate.outstanding : [];
                return (
                  <Box
                    key={t.id}
                    sx={{
                      p: 1.25,
                      borderRadius: 2,
                      border: 1,
                      borderColor: 'divider',
                      bgcolor: 'background.paper',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.5 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          flex: 1,
                          minWidth: 0,
                          overflowWrap: 'anywhere',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {t.title}
                      </Typography>
                      {card && (
                        <Chip
                          label={STATE_LABELS[card.state] || card.state}
                          size="small"
                          color={TONE_COLOR[card.tone] || 'default'}
                          sx={{ height: 22, fontSize: '0.7rem', flexShrink: 0 }}
                        />
                      )}
                    </Box>

                    {/* The one sentence she is reading. Verbatim, because a
                        paraphrase here is how the two screens start to differ. */}
                    {card?.reason && (
                      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', lineHeight: 1.45 }}>
                        {card.reason}
                      </Typography>
                    )}

                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
                      {card?.window?.opens_at && (
                        <Chip label={`Opens ${shortDate(card.window.opens_at)}`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                      )}
                      {card?.window?.closes_at && (
                        <Chip label={`Closes ${shortDate(card.window.closes_at)}`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                      )}
                      {card && card.attempts_left !== null && (
                        <Chip
                          label={`${card.attempts_left} attempt${card.attempts_left === 1 ? '' : 's'} left`}
                          size="small"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.65rem' }}
                        />
                      )}
                      {/* Exactly the classes with no caught_up_at and no
                          excused_at: the fact the gate itself reads. */}
                      {blocked.map((c) => (
                        <Chip
                          key={c.id}
                          label={`Catch up: ${c.title || 'a class'}${c.date ? ` (${shortDate(c.date)})` : ''}`}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '0.65rem',
                            color: 'warning.dark',
                            bgcolor: alpha(theme.palette.warning.main, 0.14),
                          }}
                        />
                      ))}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
