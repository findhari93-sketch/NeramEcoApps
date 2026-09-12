'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Box, Button, Chip, Paper, Skeleton, Typography, EmptyState } from '@neram/ui';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { useAuthSWR } from '@/lib/nexus-swr';
import PeopleSearchField from '@/components/PeopleSearchField';
import { useStudentStageFacts } from '@/components/students/StudentStageFactsProvider';
import StudentStageAvatar from '@/components/students/StudentStageAvatar';
import type { StageKey } from '@/lib/student-stage';
import RhythmDots from './RhythmDots';
import WeeklyGoalSheet from './WeeklyGoalSheet';

interface RhythmStudent {
  userId: string; name: string | null; avatarUrl: string | null; msOid: string | null; dormant: boolean;
  week: boolean[]; count: number; run: number; lastPracticeDate: string | null; quietDays: number | null;
}

function quietLabel(s: RhythmStudent): string | null {
  if (s.quietDays === null) return 'No sketches in 8 weeks';
  if (s.quietDays >= 3) return `Quiet ${s.quietDays} days`;
  return null;
}

/** Quiet-first: the students a teacher is looking for are the ones who stopped. */
function quietFirst(a: RhythmStudent, b: RhythmStudent): number {
  const qa = a.quietDays === null ? Infinity : a.quietDays;
  const qb = b.quietDays === null ? Infinity : b.quietDays;
  if (qa !== qb) return qb - qa;
  return (a.name || '').localeCompare(b.name || '');
}

export default function ClassRhythmList({ classroomId }: { classroomId: string }) {
  const { data, isLoading, mutate } = useAuthSWR<{ goal: number; students: RhythmStudent[] }>(
    `/api/sketchbook/class-rhythm?classroom=${encodeURIComponent(classroomId)}`,
  );
  const { factsFor } = useStudentStageFacts();
  const [query, setQuery] = useState('');
  const [goalOpen, setGoalOpen] = useState(false);

  const rows = useMemo(() => {
    const all = [...(data?.students ?? [])].sort(quietFirst);
    const q = query.trim().toLowerCase();
    return q ? all.filter((s) => (s.name || '').toLowerCase().includes(q)) : all;
  }, [data, query]);

  if (isLoading || !data) return <Skeleton variant="rounded" height={320} sx={{ borderRadius: 2 }} />;

  return (
    <Box>
      <Paper elevation={0} sx={{ p: 1.5, mb: 2, borderRadius: 2, border: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Weekly goal: {data.goal} {data.goal === 1 ? 'day' : 'days'}</Typography>
        <Button startIcon={<EditOutlinedIcon />} onClick={() => setGoalOpen(true)} sx={{ minHeight: 48 }}>Edit</Button>
      </Paper>
      <PeopleSearchField value={query} onChange={setQuery} label="Find a student" resultCount={rows.length} sx={{ mb: 2 }} />

      {rows.length === 0 ? (
        <EmptyState title="No students match" description="Try a different name." />
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {rows.map((s) => {
            const fact = factsFor(s.userId);
            const stage = ((fact?.stage as StageKey) || 'unset') as StageKey;
            const quiet = quietLabel(s);
            return (
              <Box component="li" key={s.userId}>
                <Box component={Link} href={`/teacher/sketchbook/${s.userId}`}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 64, px: 1, py: 1, borderBottom: 1, borderColor: 'divider', textDecoration: 'none', color: 'inherit', opacity: s.dormant ? 0.6 : 1,
                    '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: -3 } }}>
                  <StudentStageAvatar stage={stage} dormant={s.dormant} name={s.name} msOid={s.msOid} fallbackSrc={s.avatarUrl} size={40} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body1" sx={{ fontWeight: 600 }} noWrap data-testid="rhythm-row-name">{s.name || 'Student'}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <RhythmDots days={s.week} size={12} />
                      {s.run > 1 && <Chip size="small" label={`${s.run} weeks running`} />}
                    </Box>
                  </Box>
                  {quiet && <Chip size="small" color={s.quietDays === null ? 'default' : 'warning'} label={quiet} />}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
      <WeeklyGoalSheet open={goalOpen} onClose={() => setGoalOpen(false)} classroomId={classroomId} goal={data.goal} onSaved={() => mutate()} />
    </Box>
  );
}
