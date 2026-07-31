'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { useAuthFetch } from '@/components/curriculum/shared';

/**
 * Recaps the pipeline generated but would not publish on its own.
 *
 * Reads as a to-do list rather than an error log, because that is what it is:
 * every row is a class some student cannot catch up on until someone looks. The
 * reason is stated with the number that failed, so a tutor can tell at a glance
 * whether it needs a real edit or just a second opinion.
 *
 * Mobile first: cards, not a table. Tutors clear this queue on a phone between
 * classes, and a five-column table at 375px is unreadable.
 */

interface QueueItem {
  id: string;
  title: string;
  scheduled_class_id: string | null;
  readiness: string;
  hold_reason: string | null;
  hold_detail: string | null;
  quality_score: number | null;
  generation_attempts: number;
  protection_level: string;
  updated_at: string;
  failed_checks: Array<{ id: string; detail: string }>;
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

interface RecapReviewQueueProps {
  /**
   * Embedded in another screen rather than being the screen. Renders nothing at
   * all when the queue is empty, because an empty-state card inside a tab that
   * already has content is just noise.
   */
  compact?: boolean;
}

export default function RecapReviewQueue({ compact = false }: RecapReviewQueueProps) {
  const authFetch = useAuthFetch();
  const router = useRouter();
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch('/api/class-recaps/review-queue');
      setItems(res.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the review queue');
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

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

  if (error) {
    // Embedded, this must not shout over the screen it is sitting inside.
    return compact ? null : <Alert severity="error">{error}</Alert>;
  }

  if (!items) {
    if (compact) return null;
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rounded" height={116} />
        ))}
      </Box>
    );
  }

  if (items.length === 0) {
    if (compact) return null;
    return (
      <EmptyState
        title="Nothing waiting"
        description="Every generated recap cleared the quality checks and is live for students."
      />
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: compact ? 2.5 : 0 }}>
      <Typography variant={compact ? 'subtitle2' : 'body2'} color="text.secondary" sx={{ fontWeight: compact ? 700 : 400 }}>
        {compact
          ? `${items.length} recap${items.length === 1 ? '' : 's'} need a look before students can open them`
          : 'These classes generated but did not clear the automatic checks, so students cannot open them yet. Review the questions, then publish.'}
      </Typography>

      {items.map((item) => (
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
                {item.quality_score != null && (
                  <Chip size="small" variant="outlined" label={`Score ${item.quality_score}`} />
                )}
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
      ))}
    </Box>
  );
}
