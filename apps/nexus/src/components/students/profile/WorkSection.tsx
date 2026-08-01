'use client';

import { Box, Chip, Divider, Skeleton, Typography } from '@neram/ui';
import { EmptyNote, Field, FieldGrid } from './FieldGrid';
import ProfileSection from './ProfileSection';
import ProgressRow from './ProgressRow';
import { formatDateIN, formatPercent, humanise } from '@/lib/student-profile-fields';
import type { StudentPerformancePayload } from '@/lib/student-profile-types';

/**
 * Assignments, tests, catch-up and class-prep readiness: everything about the
 * work a student does outside the attendance register.
 *
 * Two things are deliberately shown as null rather than zero. `avg_marks_pct` is
 * null until a teacher has marked something, and `averageBestPct` is null until
 * a test has been attempted. An average of no scores is not zero, and a student
 * must not look weak because their work is sitting in a grading queue.
 */
export default function WorkSection({
  performance,
  loading,
  error,
  onFirstOpen,
}: {
  performance: StudentPerformancePayload | null;
  loading: boolean;
  error: string | null;
  onFirstOpen: () => void;
}) {
  const a = performance?.assignments ?? null;
  const tests = performance?.tests;
  const catchup = performance?.catchup;

  const submissionPct =
    a && a.applicable > 0 ? Math.round((a.submitted / a.applicable) * 100) : null;

  return (
    <ProfileSection
      id="profile-work"
      title="Assignments, tests and catch-up"
      headline={
        a
          ? a.applicable === 0
            ? 'No assignments set yet'
            : `${a.submitted} of ${a.applicable} assignments submitted`
          : null
      }
      onFirstOpen={onFirstOpen}
    >
      {loading && <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 1 }} />}
      {error && !loading && <EmptyNote>{error}</EmptyNote>}

      {performance && !loading && (
        <>
          {/* ── Assignments ────────────────────────────────────────────── */}
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Assignments
          </Typography>
          {!a || a.applicable === 0 ? (
            <EmptyNote>
              No assignment has come due for this student yet, so there is nothing to
              judge them on.
            </EmptyNote>
          ) : (
            <>
              <ProgressRow
                label="Submitted"
                value={submissionPct}
                caption={`${a.submitted} of ${a.applicable}`}
                goodAt={70}
              />
              <Box sx={{ mt: 2 }}>
                <FieldGrid>
                  <Field label="Submitted on time" value={`${a.on_time} of ${a.submitted}`} />
                  <Field label="Overdue" value={a.overdue} />
                  <Field label="Marked by a teacher" value={a.reviewed} />
                  <Field
                    label="Average mark"
                    value={formatPercent(a.avg_marks_pct)}
                    hint={a.avg_marks_pct === null ? 'Nothing has been marked yet.' : null}
                  />
                  <Field label="Last submitted" value={formatDateIN(a.last_submitted_at)} />
                  <Field
                    label="Engagement"
                    value={a.status ? humanise(a.status) : null}
                    hint={
                      a.days_since_last !== null
                        ? `${a.days_since_last} days since the last submission`
                        : null
                    }
                  />
                </FieldGrid>
              </Box>
              {a.is_late_joiner && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 1.5 }}
                >
                  {/* The personal clock matters: judging a late joiner against
                      the class due date would mark them down for work set
                      before they arrived. */}
                  Judged on their own start date, since they joined after the course began.
                </Typography>
              )}
            </>
          )}

          <Divider sx={{ my: 3 }} />

          {/* ── Tests ─────────────────────────────────────────────────── */}
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Tests
          </Typography>
          {!tests || tests.summary.total === 0 ? (
            <EmptyNote>No tests have been set for this class yet.</EmptyNote>
          ) : (
            <>
              <FieldGrid>
                <Field
                  label="Attempted"
                  value={`${tests.summary.attempted} of ${tests.summary.total}`}
                />
                <Field label="Passed" value={tests.summary.passed} />
                <Field
                  label="Average best score"
                  value={formatPercent(tests.summary.averageBestPct)}
                  hint={
                    tests.summary.averageBestPct === null
                      ? 'Nothing has been attempted yet.'
                      : null
                  }
                />
              </FieldGrid>

              <Box sx={{ display: 'grid', gap: 1, mt: 2 }}>
                {tests.items.map((t) => (
                  <Box
                    key={t.testId}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 1,
                      minHeight: 48,
                      px: 1.5,
                      py: 1,
                      borderRadius: 1,
                      bgcolor: 'action.hover',
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
                        {t.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {[
                          t.classTitle,
                          t.classDate ? formatDateIN(t.classDate) : null,
                          `Pass mark ${t.passingPct}%`,
                          t.attempts > 0
                            ? `${t.attempts} attempt${t.attempts === 1 ? '' : 's'}`
                            : 'Not attempted',
                        ]
                          .filter(Boolean)
                          .join(' . ')}
                      </Typography>
                    </Box>
                    <Chip
                      size="small"
                      label={
                        t.passed === null
                          ? 'Not attempted'
                          : t.passed
                            ? `Passed ${t.bestPct}%`
                            : `Best ${t.bestPct}%`
                      }
                      color={t.passed === null ? 'default' : t.passed ? 'success' : 'warning'}
                      variant={t.passed === null ? 'outlined' : 'filled'}
                      sx={{ fontWeight: 700, flexShrink: 0 }}
                    />
                  </Box>
                ))}
              </Box>
            </>
          )}

          <Divider sx={{ my: 3 }} />

          {/* ── Catch-up ──────────────────────────────────────────────── */}
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Catching up on missed classes
          </Typography>
          {!catchup || catchup.total === 0 ? (
            <EmptyNote>{catchup?.sentence || 'There is nothing to catch up on.'}</EmptyNote>
          ) : (
            <>
              <ProgressRow
                label="Caught up"
                value={
                  catchup.total - catchup.excused > 0
                    ? Math.round((catchup.done / (catchup.total - catchup.excused)) * 100)
                    : null
                }
                caption={`${catchup.done} of ${catchup.total - catchup.excused}`}
                emptyNote="Every missed class was excused, so nothing is owed."
                goodAt={80}
              />
              <Box sx={{ mt: 2 }}>
                <FieldGrid>
                  <Field label="Classes missed" value={catchup.missedClasses} />
                  <Field label="Joined the course late" value={catchup.lateJoinerClasses} />
                  <Field label="Still open" value={catchup.open} />
                  <Field
                    label="Excused"
                    value={catchup.excused}
                    hint={
                      catchup.excused > 0
                        ? 'Excused by a teacher, so not counted against them.'
                        : null
                    }
                  />
                </FieldGrid>
              </Box>
            </>
          )}

          {/* ── Class prep ────────────────────────────────────────────── */}
          {performance.prep && (
            <>
              <Divider sx={{ my: 3 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                Class preparation
              </Typography>
              <FieldGrid>
                <Field
                  label="Ready before class"
                  value={`${performance.prep.ready} of ${performance.prep.classesWithPrep}`}
                />
                <Field
                  label="Average prep-test score"
                  value={formatPercent(performance.prep.averageBestPct)}
                />
                <Field
                  label="Blocked at the door"
                  value={performance.prep.blockedAttempts}
                  hint={
                    performance.prep.blockedAttempts > 0
                      ? 'Tried to join before finishing the prep test.'
                      : null
                  }
                />
                <Field
                  label="Let in with a reason"
                  value={performance.prep.unlockedViaReason}
                />
              </FieldGrid>
            </>
          )}
        </>
      )}
    </ProfileSection>
  );
}
