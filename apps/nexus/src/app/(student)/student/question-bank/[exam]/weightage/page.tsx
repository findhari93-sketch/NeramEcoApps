'use client';

/**
 * Chapter weightage: which chapters past papers lean on, and how that changed.
 *
 * Students asked for two things: the whole history at a glance, and a short
 * list to start with. The page answers in that order on a laptop (the list and
 * the trends side by side, the year-by-year history below) and stacks the same
 * cards on a phone, list first.
 *
 * Every number is derived from the live chapter tags (lib/qb-weightage.ts), so
 * as teachers keep sorting questions into chapters the page follows within a
 * minute. Sections with too short a history (drawing) get a plain card instead
 * of charts, and switch over by themselves once the bank has enough years.
 *
 * Journey: entered from the exam's Question Bank page; Back returns there.
 * "Practise" opens the practice list filtered to that chapter, whose Back comes
 * here with the same section selected (?section= is in the URL for that).
 */

import { Suspense, useMemo, useState } from 'react';
import { notFound, useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Paper,
  Skeleton,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from '@neram/ui';
import PageHeader from '@/components/PageHeader';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
import { QB_EXAM_LABELS, examFromSlug, qbExamPath } from '@/lib/qb-exam-routes';
import {
  SECTION_LABELS,
  availableSections,
  buildSectionWeightage,
  describeYears,
  type ChapterStat,
  type QBWeightagePayload,
  type WeightageSection,
  type WeightageWindow,
} from '@/lib/qb-weightage';
import TopTenCard from '@/components/question-bank/weightage/TopTenCard';
import TrendsCard from '@/components/question-bank/weightage/TrendsCard';
import HistoryHeatMap from '@/components/question-bank/weightage/HistoryHeatMap';
import ThinSectionCard from '@/components/question-bank/weightage/ThinSectionCard';
import ChapterSheet from '@/components/question-bank/weightage/ChapterSheet';
import { unitColorMap } from '@/components/question-bank/weightage/weightage-colors';
import type { QBExamType } from '@neram/database';

const SHORT_LABELS: Record<WeightageSection, string> = { math: 'Maths', aptitude: 'Aptitude', drawing: 'Drawing' };
/** Practice-list `section` values; maths spans two (MCQ and numerical), so it is left to the chapter filter. */
const PRACTICE_SECTION: Partial<Record<WeightageSection, string>> = { aptitude: 'aptitude', drawing: 'drawing' };

export default function ChapterWeightagePage() {
  const params = useParams<{ exam: string }>();
  const exam = examFromSlug(params?.exam);
  if (!exam) notFound();
  return (
    <Suspense fallback={<WeightageSkeleton />}>
      <Weightage exam={exam} />
    </Suspense>
  );
}

function Weightage({ exam }: { exam: QBExamType }) {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { activeClassroom, loading: authLoading } = useNexusAuthContext();
  const classroomId = activeClassroom?.id ?? null;
  const examLabel = QB_EXAM_LABELS[exam];
  const backHref = qbExamPath('student', exam);

  const key =
    !authLoading && classroomId
      ? `/api/question-bank/weightage?classroom_id=${classroomId}&exam=${exam}`
      : null;
  const { data: res, error, isLoading, mutate } = useAuthSWR<{ data: QBWeightagePayload }>(key);
  const payload = res?.data ?? null;

  const sections = useMemo(() => availableSections(payload), [payload]);
  const asked = searchParams.get('section') as WeightageSection | null;
  const current: WeightageSection | null = asked && sections.includes(asked) ? asked : sections[0] ?? null;

  const [listWindow, setListWindow] = useState<WeightageWindow>('all');
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  // History and trends always read all years; only the top 10 follows the window.
  const all = useMemo(
    () => (payload && current ? buildSectionWeightage(payload, current, 'all') : null),
    [payload, current],
  );
  const windowed = useMemo(
    () => (payload && current ? buildSectionWeightage(payload, current, listWindow) : null),
    [payload, current, listWindow],
  );
  const colorFor = useMemo(() => (all ? unitColorMap(all, theme) : () => theme.palette.primary.main), [all, theme]);

  const selfHref = current ? `${pathname}?section=${current}` : pathname;
  const practiceHref = (c: ChapterStat) =>
    `/student/question-bank/questions?${new URLSearchParams({ exam, cat: c.slug, back: selfHref }).toString()}`;
  const practiceAllHref = () => {
    const q: Record<string, string> = { exam, back: selfHref };
    const s = current ? PRACTICE_SECTION[current] : undefined;
    if (s) q.section = s;
    if (current === 'drawing') q.fmt = 'DRAWING_PROMPT';
    return `/student/question-bank/questions?${new URLSearchParams(q).toString()}`;
  };

  const selectSection = (s: WeightageSection) => {
    setOpenSlug(null);
    router.replace(`${pathname}?section=${s}`, { scroll: false });
  };

  const openChapter = openSlug && all ? all.chapters.find((c) => c.slug === openSlug) ?? null : null;
  const waiting = authLoading || (!classroomId && !res) || isLoading;
  const gap = all?.columns.find((c) => c.kind === 'gap');

  return (
    <Box>
      <PageHeader
        title="Chapter weightage"
        subtitle={`Which chapters ${examLabel} past papers ask most`}
        backHref={backHref}
        breadcrumbs={[{ label: `${examLabel} Question Bank`, href: backHref }]}
      />

      {sections.length > 1 && current && (
        <ToggleButtonGroup
          value={current}
          exclusive
          onChange={(_e, v: WeightageSection | null) => v && selectSection(v)}
          aria-label="Section"
          sx={{
            mb: 2,
            width: { xs: '100%', sm: 'auto' },
            '& .MuiToggleButton-root': { flex: { xs: 1, sm: 'none' }, minHeight: 44, px: 2.5, textTransform: 'none', fontWeight: 700 },
          }}
        >
          {sections.map((s) => (
            <ToggleButton key={s} value={s}>
              {SHORT_LABELS[s]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      )}

      {waiting ? (
        <WeightageSkeleton />
      ) : error ? (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, textAlign: 'center' }}>
          <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
            Chapter weightage could not be loaded
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {error.message || 'Something went wrong on our side.'}
          </Typography>
          <Button variant="outlined" onClick={() => mutate()} sx={{ minHeight: 44, borderRadius: 2, textTransform: 'none' }}>
            Try again
          </Button>
        </Paper>
      ) : !classroomId ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          Chapter weightage appears once you have been added to a classroom.
        </Alert>
      ) : !all || !windowed ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          No {examLabel} past-paper questions are in the bank yet.
        </Alert>
      ) : all.mode === 'thin' ? (
        <ThinSectionCard
          section={all}
          colorFor={colorFor}
          practiceAllHref={practiceAllHref()}
          onOpen={(c) => setOpenSlug(c.slug)}
        />
      ) : (
        <Box sx={{ display: 'grid', gap: 2 }}>
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 5fr) minmax(0, 7fr)' },
              alignItems: 'start',
            }}
          >
            <TopTenCard
              section={windowed}
              storageKey={`nexus:qbWeightage:done:${exam}:${current}`}
              onWindowChange={setListWindow}
              onOpen={(c) => setOpenSlug(c.slug)}
            />
            <TrendsCard section={all} colorFor={colorFor} onOpen={(c) => setOpenSlug(c.slug)} />
          </Box>
          <HistoryHeatMap section={all} onOpen={(c) => setOpenSlug(c.slug)} />
        </Box>
      )}

      {all && current && !waiting && !error && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 2, lineHeight: 1.6, maxWidth: 720 }}>
          Based on {SECTION_LABELS[current].toLowerCase()} questions from {all.countedYears.length}{' '}
          {all.countedYears.length === 1 ? 'year' : 'years'} of {examLabel} papers in the bank ({describeYears(all)}).
          {gap ? ` Papers from ${gap.from} to ${gap.to} are not in the bank yet.` : ''} The numbers update as teachers
          sort questions into chapters. This is a guide from past papers, not a prediction.
        </Typography>
      )}

      {all && (
        <ChapterSheet
          chapter={openChapter}
          section={all}
          color={openChapter ? colorFor(openChapter.unit) : theme.palette.primary.main}
          practiceHref={practiceHref}
          onClose={() => setOpenSlug(null)}
        />
      )}
    </Box>
  );
}

function WeightageSkeleton() {
  return (
    <Box sx={{ display: 'grid', gap: 2 }} aria-busy="true" aria-label="Loading chapter weightage">
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '5fr 7fr' } }}>
        <Skeleton variant="rounded" height={420} />
        <Skeleton variant="rounded" height={420} sx={{ display: { xs: 'none', md: 'block' } }} />
      </Box>
      <Skeleton variant="rounded" height={320} />
    </Box>
  );
}
