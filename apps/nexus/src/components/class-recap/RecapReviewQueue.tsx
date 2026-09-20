'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Chip,
  Skeleton,
  EmptyState,
  Alert,
  alpha,
} from '@neram/ui';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import DoneRoundedIcon from '@mui/icons-material/DoneRounded';
import { useAuthFetch } from '@/components/curriculum/shared';
import StudentIdentityLine from '@/components/students/StudentIdentityLine';

/**
 * The only things on the catch-up screen that actually need a person.
 *
 * Two kinds of row, and both are exceptions to an otherwise automatic pipeline:
 *
 *   1. A question a student says is broken. This is the one a human genuinely
 *      has to settle, because only a teacher knows what was taught. It comes
 *      first, always, however many recaps are held underneath it.
 *   2. A recap the pipeline generated and refused to publish, after retrying it
 *      across several nights. Rare by design.
 *
 * WHAT IS NOT HERE, and the reason this list is worth reading again. There used
 * to be a third section: published recaps scoring under 0.8, under the heading
 * "worth a look when you have a minute". Every one of them was live and working.
 * Worse, a recap held on a hard check and then published by hand keeps its stale
 * quality report, because setRecapReadiness clears hold_reason and hold_detail
 * and leaves the report alone, so those cards showed a green "Live for students"
 * chip above the line "Covers 24% of the class (needs 85%)". A queue that cries
 * wolf about healthy rows trains people to ignore the rows that matter, and the
 * rows that matter are students who cannot catch up.
 *
 * Mobile first: cards, not a table. This gets cleared on a phone between
 * classes, and a five-column table at 375px is unreadable.
 */

interface QueueItem {
  id: string;
  title: string;
  scheduled_class_id: string | null;
  status?: string;
  readiness: string;
  hold_reason: string | null;
  hold_detail: string | null;
  quality_score: number | null;
  generation_attempts: number;
  protection_level: string;
  updated_at: string;
  failed_checks: Array<{ id: string; detail: string }>;
}

interface ReportItem {
  id: string;
  recap_id: string;
  question_id: string;
  question_text: string | null;
  question_active: boolean;
  section_title: string | null;
  student_id: string;
  student_name: string | null;
  student_avatar_url: string | null;
  class_title: string | null;
  scheduled_date: string | null;
  report_type: string;
  description: string | null;
  created_at: string;
}

const REASON_LABEL: Record<string, string> = {
  no_transcript: 'No transcript',
  short_transcript: 'Class too short to quiz',
  low_coverage: 'Does not cover the class',
  bad_boundaries: 'Segment timings look wrong',
  thin_questions: 'Not enough questions',
  low_quality: 'Questions need a look',
  generation_failed: 'Generation failed',
  manual: 'Held by a teacher',
};

/** What the student said was wrong, in the words they picked. */
const REPORT_LABEL: Record<string, string> = {
  wrong_answer: 'The marked answer is wrong',
  no_correct_option: 'None of the options is right',
  unclear_question: 'Cannot tell what is being asked',
  not_taught: 'Not taught in the class',
  other: 'Something else',
};

interface RecapReviewQueueProps {
  /**
   * Embedded in another screen rather than being the screen. Renders nothing at
   * all when there is nothing to do, because an empty-state card inside a tab
   * that already has content is just noise.
   */
  compact?: boolean;
  /** Tell the parent how many rows are here, so it can title itself honestly. */
  onCount?: (count: number) => void;
}

export default function RecapReviewQueue({ compact = false, onCount }: RecapReviewQueueProps) {
  const authFetch = useAuthFetch();
  const router = useRouter();
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [reports, setReports] = useState<ReportItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Settled, not all: a reports table that has not been migrated yet must not
    // hide the held recaps, which are the older and more urgent of the two.
    const [queue, reported] = await Promise.allSettled([
      authFetch('/api/class-recaps/review-queue'),
      authFetch('/api/class-recaps/question-reports'),
    ]);

    if (queue.status === 'fulfilled') setItems(queue.value.items || []);
    else {
      setItems([]);
      setError(
        queue.reason instanceof Error ? queue.reason.message : 'Could not load the review queue',
      );
    }

    setReports(reported.status === 'fulfilled' ? reported.value.items || [] : []);
  }, [authFetch]);

  /**
   * Load once, on mount, and never because a function identity changed.
   *
   * `load` depends on `authFetch`, and `useAuthFetch` only happens to be
   * memoised. The moment anything in the auth context stops being stable, an
   * effect keyed on `load` re-runs on every render, sets fresh arrays into
   * state, re-renders, and hammers both endpoints in a tight loop for as long
   * as the screen is open. Writing the test for the catch-up tab is how this
   * was found: the mocked hook returns a new function each render, which is
   * exactly the shape of the failure, and the suite ran out of heap.
   *
   * The ref keeps the latest closure available without putting it in the
   * dependency list, so a refresh after Publish still calls current code.
   */
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    void loadRef.current();
  }, []);

  const total = (items?.length ?? 0) + (reports?.length ?? 0);

  /**
   * Same trap, one step removed: a parent passing an inline arrow for onCount
   * would re-run this on every render. Harmless while the count is unchanged,
   * because setState bails on an equal number, and not worth depending on.
   */
  const countRef = useRef(onCount);
  countRef.current = onCount;
  useEffect(() => {
    if (items && reports) countRef.current?.(total);
  }, [items, reports, total]);

  const publish = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        await authFetch(`/api/class-recaps/${id}/readiness`, {
          method: 'PATCH',
          body: JSON.stringify({ action: 'publish' }),
        });
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not publish');
      } finally {
        setBusyId(null);
      }
    },
    [authFetch, load],
  );

  const closeReport = useCallback(
    async (id: string, status: 'resolved' | 'dismissed') => {
      setBusyId(id);
      try {
        await authFetch('/api/class-recaps/question-reports', {
          method: 'PATCH',
          body: JSON.stringify({ id, status }),
        });
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not update the report');
      } finally {
        setBusyId(null);
      }
    },
    [authFetch, load],
  );

  if (error && !items?.length && !reports?.length) {
    // Embedded, this must not shout over the screen it is sitting inside.
    return compact ? null : <Alert severity="error">{error}</Alert>;
  }

  if (!items || !reports) {
    if (compact) return null;
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rounded" height={116} />
        ))}
      </Box>
    );
  }

  if (total === 0) {
    if (compact) return null;
    return (
      <EmptyState
        title="Nothing needs you"
        description="Recaps publish themselves about fifteen minutes after a class ends. Anything a student reports as wrong will appear here."
      />
    );
  }

  /**
   * One reported question.
   *
   * Leads with what the student said and the question itself, because that pair
   * is the whole decision. The student is already unblocked by the time this is
   * read (reporting drops the question from their paper), so this is a
   * correctness queue, not an emergency one, and nothing here is styled to
   * alarm.
   */
  const reportCard = (r: ReportItem) => (
    <Box
      key={r.id}
      sx={{
        p: 2,
        borderRadius: 3,
        border: (t) => `1px solid ${alpha(t.palette.info.main, 0.35)}`,
        bgcolor: (t) => alpha(t.palette.info.main, 0.04),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, mb: 1 }}>
        <FlagRoundedIcon sx={{ color: 'info.main', fontSize: 20, mt: 0.25 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
            {REPORT_LABEL[r.report_type] || 'Reported'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {[r.class_title, r.section_title].filter(Boolean).join(' · ')}
          </Typography>
        </Box>
      </Box>

      {/* The face, not just the name. A teacher deciding whether a report is
          worth acting on reads who sent it first, and student-name-face
          enforces that a name on a teacher screen is never bare text. */}
      <Box sx={{ mb: 1 }}>
        <StudentIdentityLine
          student={{
            id: r.student_id,
            name: r.student_name,
            avatar_url: r.student_avatar_url,
          }}
          density="compact"
          showStage={false}
        />
      </Box>

      {r.question_text && (
        <Typography
          variant="body2"
          sx={{
            fontSize: 13,
            p: 1.25,
            mb: 1,
            borderRadius: 1.5,
            bgcolor: (t) => alpha(t.palette.text.primary, 0.04),
          }}
        >
          {r.question_text}
        </Typography>
      )}

      {r.description && (
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13, mb: 1.5 }}>
          {r.description}
        </Typography>
      )}

      {!r.question_active && (
        // The checkpoint has been rewritten since. Saving a checkpoint
        // deactivates its questions and inserts new rows, so the question this
        // report names is already gone.
        <Chip
          size="small"
          variant="outlined"
          label="This question has already been replaced"
          sx={{ mb: 1.5 }}
        />
      )}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          size="small"
          startIcon={<EditRoundedIcon />}
          onClick={() => router.push(`/teacher/class-recaps/${r.recap_id}`)}
          sx={{ minHeight: 44, textTransform: 'none' }}
        >
          Fix the question
        </Button>
        <Button
          variant="outlined"
          size="small"
          disabled={busyId === r.id}
          startIcon={<DoneRoundedIcon />}
          onClick={() => closeReport(r.id, 'resolved')}
          sx={{ minHeight: 44, textTransform: 'none' }}
        >
          Done
        </Button>
        <Button
          size="small"
          disabled={busyId === r.id}
          onClick={() => closeReport(r.id, 'dismissed')}
          sx={{ minHeight: 44, textTransform: 'none', color: 'text.secondary' }}
        >
          Question is fine
        </Button>
      </Box>
    </Box>
  );

  /**
   * One held recap.
   *
   * Amber, because a student is stuck on this one. No quality score: the score
   * describes cosmetic polish and says nothing about the hard check that caused
   * the hold, and printing a number next to a blocker invites reading it as the
   * reason.
   */
  const card = (item: QueueItem) => (
    <Box
      key={item.id}
      sx={{
        p: 2,
        borderRadius: 3,
        border: (t) => `1px solid ${alpha(t.palette.warning.main, 0.35)}`,
        bgcolor: (t) => alpha(t.palette.warning.main, 0.04),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, mb: 1 }}>
        <WarningAmberRoundedIcon sx={{ color: 'warning.main', fontSize: 20, mt: 0.25 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>{item.title}</Typography>
          <Box sx={{ display: 'flex', gap: 0.75, mt: 0.75, flexWrap: 'wrap' }}>
            <Chip
              size="small"
              label={REASON_LABEL[item.hold_reason || ''] || 'Needs review'}
              sx={{ fontWeight: 600 }}
            />
            {item.protection_level === 'embedded' && (
              // Worth surfacing: this copy plays from YouTube, so its id is
              // in the page and is copyable. A tutor may prefer to hold it.
              <Chip size="small" variant="outlined" color="warning" label="Reduced protection" />
            )}
          </Box>
        </Box>
      </Box>

      {item.failed_checks.length > 0 && (
        <Box component="ul" sx={{ m: 0, mb: 1.5, pl: 2.5 }}>
          {item.failed_checks.map((c) => (
            <Typography
              component="li"
              key={c.id}
              variant="body2"
              color="text.secondary"
              sx={{ fontSize: 13 }}
            >
              {c.detail}
            </Typography>
          ))}
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<EditRoundedIcon />}
          onClick={() => router.push(`/teacher/class-recaps/${item.id}`)}
          sx={{ minHeight: 44, textTransform: 'none' }}
        >
          Review questions
        </Button>
        <Button
          variant="contained"
          size="small"
          disabled={busyId === item.id}
          startIcon={<CheckCircleRoundedIcon />}
          onClick={() => publish(item.id)}
          sx={{ minHeight: 44, textTransform: 'none' }}
        >
          Publish anyway
        </Button>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: compact ? 2.5 : 0 }}>
      {!compact && (
        <Typography variant="body2" color="text.secondary">
          Questions students have reported, and the classes the pipeline could not publish on
          its own.
        </Typography>
      )}
      {/* Students first. A reported question is a person waiting on an answer
          only a teacher has; a held recap is the machine asking for help. */}
      {reports.map(reportCard)}
      {items.map(card)}
    </Box>
  );
}
