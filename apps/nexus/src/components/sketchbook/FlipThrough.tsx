'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Paper, Skeleton, Typography, EmptyState } from '@neram/ui';
import DoneAllOutlinedIcon from '@mui/icons-material/DoneAllOutlined';
import type { SketchbookFeatureFact, SketchbookInboxRow } from '@neram/database/queries/nexus';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useNavBadges } from '@/components/NavBadgeProvider';
import { useStudentStageFacts } from '@/components/students/StudentStageFactsProvider';
import StudentStageAvatar from '@/components/students/StudentStageAvatar';
import type { StageKey } from '@/lib/student-stage';
import { flipSketch } from './sketchbook-api';
import TeacherSketchActions from './TeacherSketchActions';

const SEEN_AFTER_MS = 1500;

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

/**
 * One sketch per screen. Buttons are the contract; arrow keys and 1/2/3 are
 * conveniences. A card on screen for 1.5 s is "seen" (the physical peek);
 * Next without a reaction is "skipped". The server never downgrades seen.
 */
export default function FlipThrough({ classroomId }: { classroomId: string }) {
  const { getToken } = useNexusAuthContext();
  const { refreshBadges } = useNavBadges();
  const { factsFor } = useStudentStageFacts();
  const { data, isLoading, mutate } = useAuthSWR<{
    sketches: Array<SketchbookInboxRow & { featured: SketchbookFeatureFact[] }>;
    remaining: number;
  }>(`/api/sketchbook/inbox?classroom=${encodeURIComponent(classroomId)}`);
  const [index, setIndex] = useState(0);
  const [local, setLocal] = useState<Record<string, { reaction?: string | null; featured?: SketchbookFeatureFact[] }>>({});
  const seenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const list = data?.sketches ?? [];
  const current = list[index] ?? null;

  useEffect(() => {
    if (!current) return;
    if (seenTimer.current) clearTimeout(seenTimer.current);
    seenTimer.current = setTimeout(() => { void flipSketch(getToken, current.id, 'seen'); }, SEEN_AFTER_MS);
    return () => { if (seenTimer.current) clearTimeout(seenTimer.current); };
  }, [current, getToken]);

  const next = useCallback(async () => {
    if (!current) return;
    if (!local[current.id]?.reaction) await flipSketch(getToken, current.id, 'skipped').catch(() => {});
    if (index + 1 >= list.length) {
      setIndex(0);
      await mutate();
    } else {
      setIndex(index + 1);
    }
    refreshBadges();
  }, [current, getToken, index, list.length, local, mutate, refreshBadges]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') { e.preventDefault(); void next(); }
      if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); setIndex(index - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, next]);

  if (isLoading || !data) {
    return <Skeleton variant="rounded" sx={{ height: 'min(70vh, 560px)', borderRadius: 2 }} />;
  }
  if (!current) {
    return (
      <EmptyState icon={<DoneAllOutlinedIcon />} title="You have flipped through everything."
        description="New sketches appear here as students add them." action={<Button onClick={() => mutate()} sx={{ minHeight: 48 }}>Check again</Button>} />
    );
  }

  const fact = factsFor(current.student.id);
  const stage = ((fact?.stage as StageKey) || 'unset') as StageKey;
  const state = local[current.id] || {};

  return (
    <Paper elevation={0} sx={{ borderRadius: 2, border: 1, borderColor: 'divider', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 'min(70vh, 640px)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5 }}>
        <StudentStageAvatar stage={stage} dormant={!!fact?.dormant} name={current.student.name} msOid={current.student.ms_oid} fallbackSrc={current.student.avatar_url} size={40} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.2 }} noWrap>{current.student.name || 'Student'}</Typography>
          <Typography variant="caption" color="text.secondary">{fmt(current.submitted_at)}</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" aria-live="polite">{index + 1} of {list.length + (data.remaining || 0)}</Typography>
      </Box>

      <Box sx={{ flex: 1, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280 }}>
        <Box component="img" src={current.original_image_url} alt={current.self_note || `Sketch by ${current.student.name || 'student'}`}
          sx={{ maxWidth: '100%', maxHeight: 'min(56vh, 520px)', objectFit: 'contain', display: 'block' }} />
      </Box>

      {current.self_note && <Typography variant="body2" sx={{ px: 1.5, pt: 1.5 }}>{current.self_note}</Typography>}

      <Box sx={{ p: 1.5, pb: 'calc(12px + env(safe-area-inset-bottom))', position: 'sticky', bottom: 0, bgcolor: 'background.paper' }}>
        <TeacherSketchActions
          compact
          sketchId={current.id}
          reaction={(state.reaction as never) ?? current.reaction}
          featured={state.featured ?? current.featured}
          selfNote={current.self_note}
          onChanged={(c) => setLocal((m) => ({ ...m, [current.id]: { ...m[current.id], ...c } }))}
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
          <Button variant="text" disabled={index === 0} onClick={() => setIndex(index - 1)} sx={{ minHeight: 48 }}>Previous</Button>
          <Button variant="contained" onClick={() => next()} sx={{ minHeight: 48, minWidth: 120 }}>Next</Button>
        </Box>
      </Box>
    </Paper>
  );
}
