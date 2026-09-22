'use client';

/**
 * Reported questions, across the whole bank.
 *
 * One card per problem (a part of a question, for every student who reported
 * it), biggest first. Each says where the question lives and opens it straight
 * in its paper, in Videos mode for a video, where the fix happens. The same
 * Mark fixed / Not a mistake the paper's pane has, from the same card.
 *
 * Flat, forms-style: the three counts ARE the filters, no tabs.
 */
import { useState } from 'react';
import { Box, Button, Paper, Skeleton, Snackbar, Typography } from '@neram/ui';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { QBReportGroup, QBReportOutcome, QBReportQueueFilter, QBReportQueueItem } from '@neram/database';
import PageHeader from '@/components/PageHeader';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useNexusSWR } from '@/lib/nexus-swr';
import { paperQuestionHref } from '@/lib/qb-paper-link';
import { ReportGroupCard } from '@/components/question-bank/paper/SolutionReportsPanel';
import { useNavBadges } from '@/components/NavBadgeProvider';

type QueueResponse = { data: QBReportQueueItem[]; counts: Record<QBReportQueueFilter, number> };

const FILTERS: { value: QBReportQueueFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Fixed' },
  { value: 'dismissed', label: 'Not a mistake' },
];

const EMPTY_MESSAGE: Record<QBReportQueueFilter, string> = {
  open: 'Nothing reported right now',
  resolved: 'Nothing has been marked fixed yet',
  dismissed: 'No report has been answered as not a mistake yet',
};

export default function TeacherReportsPage() {
  const { getToken, getTeacherToken } = useNexusAuthContext();
  const [filter, setFilter] = useState<QBReportQueueFilter>('open');
  const [toast, setToast] = useState<string | null>(null);
  const { refreshBadges } = useNavBadges();

  const { data, isLoading, mutate } = useNexusSWR<QueueResponse>(
    `/api/question-bank/reports?status=${filter}`,
    getToken,
    { dedupingInterval: 0, keepPreviousData: true },
  );
  const items = data?.data ?? [];
  const counts = data?.counts;

  const resolve = async (item: QBReportGroup, outcome: QBReportOutcome, note: string): Promise<boolean> => {
    // The teacher's chat token, so the students hear from this teacher.
    const token = (await getTeacherToken?.()) || (await getToken());
    if (!token) return false;
    try {
      const res = await fetch(`/api/question-bank/questions/${item.question_id}/reports/resolve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: item.target, part_label: item.part_label, outcome, note }),
      });
      if (!res.ok) return false;
      const people = `${item.students} student${item.students === 1 ? '' : 's'}`;
      setToast(outcome === 'fixed' ? `Marked fixed. ${people} told` : `Sent to ${people}`);
      void mutate();
      refreshBadges();
      return true;
    } catch {
      return false;
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 820, mx: 'auto' }}>
      <PageHeader
        title="Reported questions"
        subtitle="Mistakes students found in a video, solution or answer key"
        breadcrumbs={[{ label: 'Question Bank', href: '/teacher/question-bank' }]}
        backHref="/teacher/question-bank"
      />

      <Box role="group" aria-label="Show reports that are" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, mb: 2 }}>
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <Paper
              key={f.value}
              component="button"
              type="button"
              variant="outlined"
              aria-pressed={active}
              aria-label={counts ? `${f.label}, ${counts[f.value]}` : f.label}
              onClick={() => setFilter(f.value)}
              sx={{
                p: 1.25,
                minHeight: 64,
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: 'inherit',
                borderRadius: 2,
                borderColor: active ? 'primary.main' : 'divider',
                borderWidth: active ? 2 : 1,
                bgcolor: 'background.paper',
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              }}
            >
              <Typography variant="h6" component="span" fontWeight={700} sx={{ display: 'block', lineHeight: 1.2 }}>
                {counts ? counts[f.value] : '-'}
              </Typography>
              <Typography variant="caption" color={active ? 'primary.main' : 'text.secondary'} fontWeight={600}>
                {f.label}
              </Typography>
            </Paper>
          );
        })}
      </Box>

      {isLoading && !data && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={150} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      )}

      {data && items.length === 0 && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <InboxOutlinedIcon aria-hidden sx={{ fontSize: 48, color: 'text.secondary', mb: 1.5 }} />
          <Typography variant="body1" fontWeight={600}>
            {EMPTY_MESSAGE[filter]}
          </Typography>
          {filter === 'open' && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              When a student reports a wrong video or answer, it shows up here and on the question in its paper.
            </Typography>
          )}
        </Paper>
      )}

      {items.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {items.map((item) => {
            const where = [item.paper_label, item.question_number != null ? `Q${item.question_number}` : null]
              .filter(Boolean)
              .join(', ');
            return (
              <ReportGroupCard
                key={`${item.question_id}|${item.target}|${item.part_label ?? ''}`}
                group={item}
                videoUrl={null}
                onResolve={resolve}
                context={
                  <Box sx={{ mb: 0.75 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600} component="p" sx={{ m: 0 }}>
                      {where || 'Question not on a paper'}
                    </Typography>
                    {item.question_text && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                      >
                        {item.question_text}
                      </Typography>
                    )}
                  </Box>
                }
                extraActions={
                  item.paper_id ? (
                    <Button
                      href={paperQuestionHref(item.paper_id, item.question_id, item.target === 'video' ? 'videos' : 'edit')}
                      variant="text"
                      endIcon={<OpenInNewIcon aria-hidden sx={{ fontSize: 16 }} />}
                      sx={{ minHeight: 44, textTransform: 'none' }}
                    >
                      Open in paper
                    </Button>
                  ) : null
                }
              />
            );
          })}
        </Box>
      )}

      <Snackbar
        open={!!toast}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
