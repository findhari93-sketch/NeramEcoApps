'use client';

/**
 * Drawings to mark, on the exam results sheet.
 *
 * An exam's drawings are marked by a teacher before its results can be final.
 * Each row opens the one review screen with a marks box out of the marks this
 * test gives the question, and Back returns to this exam.
 */

import Link from 'next/link';
import { Box, Paper, Skeleton, Typography } from '@neram/ui';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import StudentAvatar from '@/components/students/StudentAvatar';
import { useAuthSWR } from '@/lib/nexus-swr';

interface ExamDrawingRow {
  submission_id: string;
  student_id: string;
  student_name: string;
  avatar_url: string | null;
  image_url: string;
  awarded: number | null;
  max_marks: number;
  status: string | null;
}

export function examDrawingHref(submissionId: string, examId: string, classId: string | null): string {
  const qs = new URLSearchParams({ from: 'exam', exam: examId });
  if (classId) qs.set('class', classId);
  return `/teacher/drawing-reviews/${submissionId}?${qs.toString()}`;
}

export default function ExamDrawingsToMark({ examId, classId, open }: { examId: string; classId: string | null; open: boolean }) {
  // The global SWR default dedupes a key for 15 seconds (see providers.tsx), which is
  // right for most sections but wrong here: a teacher who marks a drawing and presses
  // Back returns to this exact list within seconds, and a stale "Not marked" row would
  // be actively misleading rather than merely out of date. Overridden locally, not in
  // the global default, because every other section still wants that dedupe window.
  const { data, isLoading } = useAuthSWR<{ drawings: ExamDrawingRow[] }>(
    open ? `/api/exams/${examId}/drawings` : null,
    { dedupingInterval: 0, revalidateOnMount: true },
  );
  if (isLoading) return <Skeleton variant="rounded" height={72} sx={{ borderRadius: 2, mb: 2 }} />;
  const rows = data?.drawings ?? [];
  if (rows.length === 0) return null;
  const unmarked = rows.filter((r) => r.awarded == null).length;

  return (
    <Paper variant="outlined" component="section" aria-labelledby="exam-drawings-to-mark" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
      <Typography id="exam-drawings-to-mark" variant="subtitle1" component="h3" sx={{ fontWeight: 700 }}>
        {unmarked > 0 ? `Drawings to mark (${unmarked})` : 'Drawings, all marked'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {unmarked > 0
          ? 'Results stay Provisional until every drawing has marks.'
          : 'Every drawing has marks, so these results can be final.'}
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {rows.map((r) => (
          <Box component="li" key={r.submission_id}>
            <Box
              component={Link}
              href={examDrawingHref(r.submission_id, examId, classId)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 56, px: 1, borderRadius: 1.5,
                color: 'text.primary', textDecoration: 'none',
                '&:hover': { bgcolor: 'action.hover' },
                '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              }}
            >
              <Box component="img" src={r.image_url} alt="" loading="lazy" sx={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 1, flexShrink: 0 }} />
              <StudentAvatar userId={r.student_id} src={r.avatar_url} name={r.student_name} size={32} />
              <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>{r.student_name}</Typography>
              {r.awarded == null ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary', flexShrink: 0 }}>
                  <EditOutlinedIcon fontSize="small" aria-hidden />
                  <Typography variant="body2">Not marked</Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                  <CheckCircleRoundedIcon fontSize="small" color="success" aria-hidden />
                  <Typography variant="body2">{r.awarded} of {r.max_marks}</Typography>
                </Box>
              )}
            </Box>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
