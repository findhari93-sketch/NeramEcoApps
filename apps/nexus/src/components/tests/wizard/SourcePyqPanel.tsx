'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  FormControlLabel,
  Paper,
  Radio,
  RadioGroup,
  Skeleton,
  Tab,
  Tabs,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import type { PaperBlueprint, TestDraft } from '@/lib/test-wizard-draft';

/**
 * Step 2, previous-year-paper branch.
 *
 * Two imports, and the difference matters. "Exam-faithful" keeps the paper's
 * sections and its marking, and skips question review entirely, because a
 * verified paper has already been reviewed by the board that set it. "Questions
 * only" turns the same paper into editable raw material and goes through review
 * like anything else.
 */

interface PaperRow {
  id: string;
  year: number;
  total_questions: number | null;
  duration_minutes: number | null;
  exam_type: string;
}

export default function SourcePyqPanel({
  draft,
  onPatch,
  authFetch,
}: {
  draft: TestDraft;
  onPatch: (patch: Partial<TestDraft['pyq']>) => void;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
}) {
  const theme = useTheme();
  const [exam, setExam] = useState<'JEE_PAPER_2' | 'NATA'>('JEE_PAPER_2');
  const [papers, setPapers] = useState<PaperRow[] | null>(null);
  const [loadingBlueprint, setLoadingBlueprint] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPapers(null);
    (async () => {
      try {
        const json = await authFetch(`/api/question-bank/papers?exam_type=${exam}`);
        if (cancelled) return;
        setPapers((json.data?.papers || json.data || []) as PaperRow[]);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load papers');
          setPapers([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [exam, authFetch]);

  // Structure only, never the questions: the year grid draws three lines per
  // paper, and shipping 82 full question rows to do that is most of the reason
  // it would feel slow.
  const choosePaper = async (paperId: string) => {
    onPatch({ paperId, blueprint: null });
    setLoadingBlueprint(true);
    try {
      const json = await authFetch(`/api/question-bank/papers/${paperId}?structure=1`);
      const bp = json.data?.blueprint;
      const paper = json.data?.paper;
      onPatch({
        paperId,
        blueprint: {
          paperId,
          examType: paper?.exam_type ?? exam,
          year: paper?.year ?? 0,
          durationMinutes: paper?.duration_minutes ?? null,
          sections: bp?.sections ?? [],
        } as PaperBlueprint,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that paper');
    } finally {
      setLoadingBlueprint(false);
    }
  };

  const blueprint = draft.pyq.blueprint;

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 320px' },
        gap: 2.5,
        alignItems: 'start',
      }}
    >
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 2 }}>
        <Tabs value={exam} onChange={(_, v) => setExam(v)} sx={{ mb: 2, minHeight: 48 }}>
          <Tab value="JEE_PAPER_2" label="JEE Paper 2" sx={{ textTransform: 'none', minHeight: 48 }} />
          <Tab value="NATA" label="NATA" sx={{ textTransform: 'none', minHeight: 48 }} />
        </Tabs>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {papers === null ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} variant="rounded" height={72} />
            ))}
          </Box>
        ) : papers.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No {exam === 'NATA' ? 'NATA' : 'JEE Paper 2'} papers have been uploaded yet.
          </Typography>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}>
            {papers.map((p) => {
              const chosen = draft.pyq.paperId === p.id;
              return (
                <Paper
                  key={p.id}
                  variant="outlined"
                  role="button"
                  tabIndex={0}
                  onClick={() => choosePaper(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      choosePaper(p.id);
                    }
                  }}
                  sx={{
                    p: 1.5,
                    minHeight: 72,
                    borderRadius: 2,
                    cursor: 'pointer',
                    borderWidth: 1.5,
                    borderColor: chosen ? 'primary.main' : 'divider',
                    bgcolor: chosen ? alpha(theme.palette.primary.main, 0.06) : 'transparent',
                    '&:hover': { borderColor: 'primary.light' },
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {p.year}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {p.total_questions ?? '?'} Q
                    {p.duration_minutes ? ` · ${Math.round(p.duration_minutes / 60)} h` : ''}
                  </Typography>
                </Paper>
              );
            })}
          </Box>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        {!draft.pyq.paperId ? (
          <Typography variant="body2" color="text.secondary">
            Pick a year to see how the paper is built.
          </Typography>
        ) : loadingBlueprint || !blueprint ? (
          <CircularProgress size={22} />
        ) : (
          <>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {blueprint.examType === 'NATA' ? 'NATA' : 'JEE Paper 2'} · {blueprint.year}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Verified paper
            </Typography>

            {blueprint.sections.map((s) => (
              <Box
                key={s.name}
                sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {s.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {s.questionCount} Q · +{s.marks}
                  {s.negativeMarks > 0 ? ` / −${s.negativeMarks}` : ''}
                </Typography>
              </Box>
            ))}

            {/* The marking is the published scheme, not something read off this
                paper. Saying so lets a teacher correct it in step 4 instead of
                finding out at results time. */}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Marking shown is the published scheme for this exam.
            </Typography>

            <RadioGroup
              value={draft.pyq.mode}
              onChange={(e) => onPatch({ mode: e.target.value as 'faithful' | 'questions_only' })}
              sx={{ mt: 2 }}
            >
              <FormControlLabel
                value="faithful"
                control={<Radio />}
                sx={{ alignItems: 'flex-start', mb: 1 }}
                label={
                  <Box sx={{ pt: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Exam-faithful mock <Chip size="small" label="recommended" sx={{ height: 18, ml: 0.5 }} />
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Sections, timing and marking kept. Skips question review, the paper is already verified.
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel
                value="questions_only"
                control={<Radio />}
                sx={{ alignItems: 'flex-start' }}
                label={
                  <Box sx={{ pt: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Questions only
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Editable raw material. Pick, remix and retime it like any other test.
                    </Typography>
                  </Box>
                }
              />
            </RadioGroup>
          </>
        )}
      </Paper>
    </Box>
  );
}
