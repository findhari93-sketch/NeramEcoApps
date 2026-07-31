'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Drawer,
  SwipeableDrawer,
  Skeleton,
  Alert,
  Chip,
  Divider,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import AttendanceStrip from './AttendanceStrip';
import StatusPill from './StatusPill';
import { RADIUS, SECTION_LABEL_SX } from '@/components/timetable/timetable-theme';
import { formatTimeCompact } from '@/components/timetable/date-utils';
import {
  ATTENDANCE_STATUS,
  recordingStatus,
  resourceStatus,
  describeMinutes,
} from '@/lib/parent-status';
import { describeAggregate } from '@/lib/parent-aggregate';
import type {
  ParentClass,
  ParentClassDetailResponse,
  ParentAssignmentDetail,
  ParentTestDetail,
  ParentCatchupStatus,
} from '@/lib/parent-view-types';

/**
 * One class, in full, for a parent.
 *
 * WHY THIS IS NOT ClassDetailPanel
 * --------------------------------
 * That component renders a "Watch Recording" button with no role guard, and
 * unconditionally mounts ClassResourcesSection and ClassCaptureView, which fetch
 * /resources, /wrap-up and /images. All three reject a parent token, so reusing
 * it would give a parent three silently empty sections instead of the honest
 * counts, plus a recording button that 403s. It is also 1,328 lines of teacher
 * and student branching, and the parent's section order is genuinely different.
 *
 * SECTION ORDER is by what a parent came to find out, not by what is easiest to
 * render: attendance first (it is the question they actually asked), then what
 * was covered, then status of the recording and materials, then the work, the
 * test, and finally catch-up. The footer says out loud that this is read only,
 * which pre-empts "why can't I tap anything".
 */

interface ParentClassSheetProps {
  cls: ParentClass | null;
  open: boolean;
  onClose: () => void;
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 2 }}>
      <Typography sx={SECTION_LABEL_SX}>{label}</Typography>
      {children}
    </Box>
  );
}

function friendlyDate(ymd: string): string {
  const ms = Date.parse(`${ymd}T00:00:00+05:30`);
  if (!Number.isFinite(ms)) return ymd;
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Kolkata',
  }).format(ms);
}

function friendlyDay(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Kolkata',
  }).format(ms);
}

export default function ParentClassSheet({ cls, open, onClose }: ParentClassSheetProps) {
  const theme = useTheme();
  const { getToken } = useNexusAuthContext();
  const isMobile = !useMediaQuery(theme.breakpoints.up('md'));

  const [detail, setDetail] = useState<ParentClassDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !cls) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const res = await fetch(`/api/parent/classes/${cls.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Could not load this class.');
        if (!cancelled) setDetail(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load this class.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, cls, getToken]);

  const body = cls ? (
    <Box sx={{ overflowY: 'auto', pb: 3 }}>
      {/* 1. Header */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 1,
          bgcolor: 'background.paper',
          borderBottom: `1px solid ${theme.palette.divider}`,
          px: { xs: 2, sm: 2.5 },
          py: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 18, lineHeight: 1.3 }}>
              {cls.title}
            </Typography>
            <Typography sx={{ fontSize: 14, color: 'text.secondary', mt: 0.5 }}>
              {friendlyDate(cls.scheduled_date)}
            </Typography>
            <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
              {formatTimeCompact(cls.start_time)} to {formatTimeCompact(cls.end_time)}
              {cls.teacher?.name ? ` · ${cls.teacher.name}` : ''}
            </Typography>
          </Box>
          <IconButton
            onClick={onClose}
            aria-label="Close"
            sx={{ minWidth: 48, minHeight: 48, flexShrink: 0 }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </Box>

      {error && (
        <Box sx={{ p: 2 }}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}

      {/* 2. Attendance. First, because it is what a parent came to find out, and
             it is the one place the "how long was he there" question is answered. */}
      {cls.phase === 'past' && cls.attendance && (
        <Section label="Attendance">
          <AttendanceStrip
            date={cls.attendance.date}
            title={cls.title}
            startTime={cls.attendance.startTime}
            endTime={cls.attendance.endTime}
            scheduledMinutes={cls.attendance.scheduledMinutes}
            measurement={cls.attendance.measurement}
            label={ATTENDANCE_STATUS[cls.attendance.label].label}
            attended={cls.attendance.attended}
            durationMinutes={cls.attendance.durationMinutes}
            segments={cls.attendance.segments}
            reasonNote={cls.attendance.reasonNote}
          />
        </Section>
      )}

      {/* 3. What happened in class */}
      <Section label={cls.phase === 'upcoming' ? 'What this class covers' : 'What happened in class'}>
        {loading && !detail ? (
          <Skeleton variant="rounded" height={72} />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            {cls.topicTitle && (
              <Chip
                size="small"
                label={cls.topicTitle}
                sx={{ alignSelf: 'flex-start', fontWeight: 600 }}
              />
            )}

            {cls.description && (
              <Typography
                sx={{ fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}
              >
                {cls.description}
              </Typography>
            )}

            {/* The teacher's full written account, the long form of the bullets
                below. A parent whose child missed the class is reading this to
                find out what was actually taught, so it is not truncated. */}
            {detail?.whatHappened.note ? (
              <Typography
                data-testid="parent-class-note"
                sx={{ fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}
              >
                {detail.whatHappened.note}
              </Typography>
            ) : null}

            {/* The AI brief of what actually happened, as opposed to the plan. */}
            {detail?.whatHappened.bullets.length ? (
              <Box component="ul" sx={{ pl: 2.5, m: 0, display: 'grid', gap: 0.75 }}>
                {detail.whatHappened.bullets.map((b, i) => (
                  <Typography
                    key={i}
                    component="li"
                    sx={{ fontSize: 15, lineHeight: 1.55 }}
                  >
                    {b}
                  </Typography>
                ))}
              </Box>
            ) : null}

            {detail?.whatHappened.tags.length ? (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {detail.whatHappened.tags.map((t) => (
                  <Chip key={t.id} size="small" variant="outlined" label={t.label} />
                ))}
              </Box>
            ) : null}

            {/* Photos of the board are a record of the session, not teaching
                material, which is why they are here and the recording is not. */}
            {detail?.whatHappened.images.length ? (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
                  gap: 1,
                  mt: 0.5,
                }}
              >
                {detail.whatHappened.images.map((img) => (
                  <Box
                    key={img.id}
                    component="img"
                    src={img.thumb_url || img.url}
                    alt={img.caption || 'Photo from the class'}
                    loading="lazy"
                    sx={{
                      width: '100%',
                      aspectRatio: '4 / 3',
                      objectFit: 'cover',
                      borderRadius: 1.5,
                      border: `1px solid ${theme.palette.divider}`,
                    }}
                  />
                ))}
              </Box>
            ) : null}

            {!cls.description &&
              !detail?.whatHappened.note &&
              !detail?.whatHappened.bullets.length &&
              !loading && (
                <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
                  The teacher has not written up this class yet.
                </Typography>
              )}
          </Box>
        )}
      </Section>

      <Divider />

      {/* 4 and 5. Recording and materials: status, never content. */}
      {(cls.recording.available || cls.resources.count > 0) && (
        <>
          <Section label="Recording and materials">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {(() => {
                const rec = recordingStatus(cls);
                if (!rec) return null;
                return (
                  <Box>
                    <StatusPill status={rec} />
                    {rec.detail && (
                      <Typography
                        sx={{ fontSize: 14, color: 'text.secondary', mt: 0.75 }}
                      >
                        {rec.detail}
                      </Typography>
                    )}
                  </Box>
                );
              })()}

              {resourceStatus(cls) && (
                <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
                  {resourceStatus(cls)} Students can open these in their own app.
                </Typography>
              )}
            </Box>
          </Section>
          <Divider />
        </>
      )}

      {/* 6. The work */}
      {loading && !detail ? (
        <Section label="Work">
          <Skeleton variant="rounded" height={88} />
        </Section>
      ) : detail?.assignments.length ? (
        <>
          <Section label={detail.assignments.length === 1 ? 'Work set' : 'Work set'}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {detail.assignments.map((a) => (
                <AssignmentBlock key={a.id} assignment={a} />
              ))}
            </Box>
          </Section>
          <Divider />
        </>
      ) : null}

      {/* 7. The test */}
      {detail?.tests.length ? (
        <>
          <Section label={detail.tests.length === 1 ? 'Test' : 'Tests'}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {detail.tests.map((t) => (
                <TestBlock key={t.testId} test={t} />
              ))}
            </Box>
          </Section>
          <Divider />
        </>
      ) : null}

      {/* 8. Catch-up, only when there is something to catch up on */}
      {detail?.catchup ? (
        <>
          <Section label="Catching up">
            <CatchupBlock catchup={detail.catchup} />
          </Section>
          <Divider />
        </>
      ) : null}

      {/* 9. Why nothing here is tappable */}
      <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 2 }}>
        <Typography sx={{ fontSize: 13, color: 'text.disabled', lineHeight: 1.5 }}>
          This is a read-only view of your child&apos;s progress. Lessons,
          recordings and materials open in your child&apos;s own account.
        </Typography>
      </Box>
    </Box>
  ) : null;

  const common = {
    open,
    onClose,
  };

  // Bottom sheet below md, right drawer above, matching the pattern
  // ClassDetailPanel established so the two feel like one product.
  return isMobile ? (
    <SwipeableDrawer
      {...common}
      onOpen={() => {}}
      anchor="bottom"
      disableSwipeToOpen
      swipeAreaWidth={0}
      PaperProps={{
        sx: {
          maxHeight: '85vh',
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
        },
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 4,
          borderRadius: 2,
          bgcolor: alpha(theme.palette.text.disabled, 0.4),
          mx: 'auto',
          my: 1,
          flexShrink: 0,
        }}
      />
      {body}
    </SwipeableDrawer>
  ) : (
    <Drawer
      {...common}
      anchor="right"
      PaperProps={{ sx: { width: 420, maxWidth: '100vw' } }}
    >
      {body}
    </Drawer>
  );
}

/** One assignment: the child's status, the teacher's words, then the class total. */
function AssignmentBlock({ assignment }: { assignment: ParentAssignmentDetail }) {
  const theme = useTheme();

  const status =
    assignment.bucket === 'marked'
      ? { label: 'Marked', tone: 'success' as const }
      : assignment.bucket === 'waiting_on_teacher'
        ? { label: 'Handed in', tone: 'primary' as const }
        : assignment.isOverdue
          ? { label: 'Overdue', tone: 'error' as const }
          : { label: 'Still to do', tone: 'warning' as const };

  const due = friendlyDay(assignment.dueOn ? `${assignment.dueOn}T00:00:00+05:30` : null);

  return (
    <Box
      sx={{
        p: 1.75,
        borderRadius: RADIUS.control,
        border: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.75 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 15, flex: 1, minWidth: 0 }}>
          {assignment.title}
        </Typography>
        <StatusPill status={status} />
      </Box>

      {assignment.timing === 'prework' && (
        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
          To be done before the class
        </Typography>
      )}
      {due && (
        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Due {due}</Typography>
      )}

      {assignment.score !== null && (
        <Typography sx={{ fontSize: 15, fontWeight: 600, mt: 0.75 }}>
          {assignment.evaluationType === 'stars'
            ? `${assignment.score} out of ${assignment.maxScore ?? 5} stars`
            : `${assignment.score} out of ${assignment.maxScore ?? 10}`}
        </Typography>
      )}

      {assignment.attempt > 1 && (
        <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.25 }}>
          Submitted {assignment.attempt} times
        </Typography>
      )}

      {/* The teacher's feedback, verbatim. Never truncated or reworded. */}
      {assignment.feedback && (
        <Box
          sx={{
            mt: 1,
            p: 1.25,
            borderRadius: 1.5,
            bgcolor: alpha(theme.palette.primary.main, 0.05),
          }}
        >
          <Typography sx={{ fontSize: 14, lineHeight: 1.55 }}>
            {assignment.feedback}
          </Typography>
        </Box>
      )}

      {/* Scale, so a parent knows whether to worry. Never who. */}
      <Typography sx={{ fontSize: 13, color: 'text.disabled', mt: 1 }}>
        {describeAggregate(assignment.aggregate)}
      </Typography>
    </Box>
  );
}

function TestBlock({ test }: { test: ParentTestDetail }) {
  const theme = useTheme();

  const status = !test.attempts
    ? { label: 'Not taken yet', tone: 'warning' as const }
    : test.passed
      ? { label: 'Passed', tone: 'success' as const }
      : { label: 'Not passed yet', tone: 'warning' as const };

  return (
    <Box
      sx={{
        p: 1.75,
        borderRadius: RADIUS.control,
        border: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.75 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 15, flex: 1, minWidth: 0 }}>
          {test.title}
        </Typography>
        <StatusPill status={status} />
      </Box>

      {test.attempts > 0 ? (
        <>
          <Typography sx={{ fontSize: 15, fontWeight: 600 }}>
            {typeof test.bestPct === 'number'
              ? `Best score ${Math.round(test.bestPct)}%`
              : 'Score not recorded'}
            {test.bestScore !== null && test.totalMarks !== null
              ? ` (${test.bestScore} of ${test.totalMarks})`
              : ''}
          </Typography>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.25 }}>
            {test.attempts === 1 ? 'One attempt' : `${test.attempts} attempts`} · pass
            mark {test.passingPct}%
          </Typography>
        </>
      ) : (
        <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
          Your child has not taken this test yet. The pass mark is {test.passingPct}%.
        </Typography>
      )}
    </Box>
  );
}

/** The three steps of catching up, each either done or not. */
function CatchupBlock({ catchup }: { catchup: ParentCatchupStatus }) {
  const steps = [
    {
      label: 'Watched the recording',
      done: catchup.recordingWatched,
    },
    {
      label: catchup.assignmentsTotal
        ? `Finished the work (${
            catchup.assignmentsTotal - catchup.assignmentsOutstanding
          } of ${catchup.assignmentsTotal})`
        : 'No work to do',
      done: catchup.assignmentsOutstanding === 0,
    },
    ...(catchup.testRequired
      ? [{ label: 'Passed the class test', done: catchup.testPassed }]
      : []),
  ];

  const caughtUp = friendlyDay(catchup.caughtUpAt);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {catchup.kind === 'late_joiner' && (
        <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
          Your child joined the class after this session, so this is catch-up work
          rather than a missed class.
        </Typography>
      )}
      {catchup.reasonNote && (
        <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
          Reason given: {catchup.reasonNote}
        </Typography>
      )}

      {steps.map((step) => (
        <Box key={step.label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <StatusPill
            status={{
              label: step.done ? 'Done' : 'Not yet',
              tone: step.done ? 'success' : 'warning',
            }}
          />
          <Typography sx={{ fontSize: 14 }}>{step.label}</Typography>
        </Box>
      ))}

      {caughtUp && (
        <Typography sx={{ fontSize: 14, color: 'success.dark', fontWeight: 600, mt: 0.5 }}>
          Marked as caught up on {caughtUp}
        </Typography>
      )}
    </Box>
  );
}
