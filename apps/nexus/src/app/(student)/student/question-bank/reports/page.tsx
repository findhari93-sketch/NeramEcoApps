'use client';

/**
 * My reports: every mistake this student reported, and what came of it.
 *
 * Reached from the report sheet's "See my reports" and from the message a
 * teacher's decision sends. Each card says which question (paper and number,
 * since "Question 31" alone is not enough across papers), what the student
 * said was wrong, where it stands, and the teacher's words when there are any.
 * Status is spelled out beside an icon, never left to a chip colour.
 */
import { useRouter } from 'next/navigation';
import { Box, Button, IconButton, Paper, Skeleton, Typography } from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { qbReportLabel, type QBReportStatus, type QBStudentReportItem } from '@neram/database';
import { useAuthSWR } from '@/lib/nexus-swr';
import { formatAgo } from '@/lib/slides-panel';

const STATUS: Record<QBReportStatus, { label: string; Icon: typeof CheckCircleIcon; color: string }> = {
  open: { label: 'Waiting for a teacher', Icon: HourglassEmptyIcon, color: 'text.secondary' },
  in_review: { label: 'A teacher is checking', Icon: HourglassEmptyIcon, color: 'text.secondary' },
  resolved: { label: 'Fixed', Icon: CheckCircleIcon, color: 'success.dark' },
  dismissed: { label: 'Checked: not a mistake', Icon: InfoOutlinedIcon, color: 'text.primary' },
};

export default function StudentReportsPage() {
  const router = useRouter();
  const { data, isLoading } = useAuthSWR<{ data: QBStudentReportItem[] }>('/api/question-bank/reports', {
    dedupingInterval: 0,
  });
  const reports = data?.data ?? [];

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 640, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton
          onClick={() => router.push('/student/question-bank')}
          aria-label="Back to Question Bank"
          sx={{ minWidth: 48, minHeight: 48 }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" component="h1" fontWeight={700}>
          My reports
        </Typography>
      </Box>

      {isLoading && !data && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={112} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      )}

      {data && reports.length === 0 && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <InboxOutlinedIcon aria-hidden sx={{ fontSize: 48, color: 'text.secondary', mb: 1.5 }} />
          <Typography variant="body1" fontWeight={600}>
            No reports yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Spotted a wrong video, solution or answer? Press &quot;Report a mistake&quot; under it after you answer.
          </Typography>
        </Paper>
      )}

      {reports.length > 0 && (
        <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {reports.map((r) => {
            const status = STATUS[r.status] ?? STATUS.open;
            const where = [r.paper_label, r.question_number != null ? `Q${r.question_number}` : null]
              .filter(Boolean)
              .join(', ');
            const closed = r.status === 'resolved' || r.status === 'dismissed';
            return (
              <Paper component="li" key={r.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary" component="p" sx={{ m: 0 }}>
                  {where || 'A question'}
                  {r.part_label ? `, part ${r.part_label}` : ''}
                </Typography>
                <Typography variant="body2" fontWeight={700} sx={{ mt: 0.25 }}>
                  {qbReportLabel(r.target, r.report_type)}
                </Typography>
                {r.question_text && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 0.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                  >
                    {r.question_text}
                  </Typography>
                )}
                {r.description && (
                  <Typography variant="body2" sx={{ mt: 0.75, wordBreak: 'break-word' }}>
                    You said: {r.description}
                  </Typography>
                )}

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1, color: status.color }}>
                  <status.Icon aria-hidden sx={{ fontSize: 18 }} />
                  <Typography variant="body2" fontWeight={600}>
                    {status.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                    {formatAgo(closed ? r.resolved_at ?? r.created_at : r.created_at)}
                  </Typography>
                </Box>

                {closed && r.resolution_note && (
                  <Box sx={{ mt: 1, p: 1.25, borderRadius: 1.5, bgcolor: 'action.hover' }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600} component="p" sx={{ m: 0 }}>
                      From your teacher
                    </Typography>
                    <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                      {r.resolution_note}
                    </Typography>
                  </Box>
                )}

                <Button
                  href={`/student/question-bank/questions/${r.question_id}`}
                  size="small"
                  sx={{ mt: 1, ml: -1, minHeight: 44, textTransform: 'none' }}
                >
                  Open the question
                </Button>
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
