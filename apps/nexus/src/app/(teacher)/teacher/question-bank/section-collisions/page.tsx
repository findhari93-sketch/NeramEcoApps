'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Skeleton, Snackbar, Stack, Typography } from '@neram/ui';
import PageHeader from '@/components/PageHeader';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { QB_EXAM_TYPE_LABELS, type QBExamType, type QBQuestionSection } from '@neram/database';
import CollisionReviewGroup, { type CollisionCandidate } from '@/components/question-bank/CollisionReviewGroup';

interface CollisionEntry {
  section: string;
  display_order: number;
  candidates: CollisionCandidate[];
}

interface PaperCollisions {
  paper_id: string;
  exam_type: string;
  year: number | null;
  session: string | null;
  collisions: CollisionEntry[];
}

/**
 * Review queue for questions crammed onto the same section + number.
 *
 * Every candidate on screen starts pre-selected to its suggestion (computed
 * server-side by suggestSection) but nothing is written until a teacher
 * presses Apply for that paper, matching the reclassify page's proposal
 * review shape: staged, then confirmed, never silently applied.
 */
export default function SectionCollisionsPage() {
  const { getToken } = useNexusAuthContext();

  const [papers, setPapers] = useState<PaperCollisions[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyingPaperId, setApplyingPaperId] = useState<string | null>(null);
  // paper_id -> question_id -> chosen section
  const [selections, setSelections] = useState<Record<string, Record<string, QBQuestionSection>>>({});
  const [snack, setSnack] = useState<{ open: boolean; msg: string; severity: 'success' | 'error' }>({
    open: false,
    msg: '',
    severity: 'success',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/question-bank/section-collisions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load collisions');
      const json = await res.json();
      const loadedPapers: PaperCollisions[] = json.data?.papers || [];
      setPapers(loadedPapers);

      // Default every candidate to its suggestion.
      const nextSelections: Record<string, Record<string, QBQuestionSection>> = {};
      for (const paper of loadedPapers) {
        nextSelections[paper.paper_id] = {};
        for (const collision of paper.collisions) {
          for (const candidate of collision.candidates) {
            if (candidate.suggested_section) {
              nextSelections[paper.paper_id][candidate.id] = candidate.suggested_section;
            }
          }
        }
      }
      setSelections(nextSelections);
    } catch (err) {
      setSnack({ open: true, msg: err instanceof Error ? err.message : 'Failed to load', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const select = (paperId: string, candidateId: string, section: QBQuestionSection) => {
    setSelections((prev) => ({
      ...prev,
      [paperId]: { ...prev[paperId], [candidateId]: section },
    }));
  };

  const unresolvedCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const paper of papers) {
      let n = 0;
      for (const collision of paper.collisions) {
        for (const candidate of collision.candidates) {
          if (!selections[paper.paper_id]?.[candidate.id]) n++;
        }
      }
      counts[paper.paper_id] = n;
    }
    return counts;
  }, [papers, selections]);

  async function applyPaper(paperId: string) {
    const paperSelections = selections[paperId] || {};
    const resolutions = Object.entries(paperSelections).map(([question_id, section]) => ({
      question_id,
      section,
    }));
    if (resolutions.length === 0) return;

    setApplyingPaperId(paperId);
    try {
      const token = await getToken();
      const res = await fetch('/api/question-bank/section-collisions', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ paper_id: paperId, resolutions }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Request failed');
      }
      const json = await res.json();
      setSnack({ open: true, msg: `Fixed ${json.data?.updated ?? 0} questions`, severity: 'success' });
      await load();
    } catch (err) {
      setSnack({ open: true, msg: err instanceof Error ? err.message : 'Failed', severity: 'error' });
    } finally {
      setApplyingPaperId(null);
    }
  }

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, pb: 12, maxWidth: 900, mx: 'auto' }}>
      <PageHeader
        title="Fix numbering clashes"
        subtitle="Questions crammed onto the same section and number. Nothing changes until you apply a paper."
        breadcrumbs={[{ label: 'Question Bank', href: '/teacher/question-bank' }]}
        backHref="/teacher/question-bank"
      />

      {loading ? (
        <Stack spacing={1}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={120} />
          ))}
        </Stack>
      ) : papers.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="body1" fontWeight={600}>
            No clashes found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Every paper's questions have a unique number within their section.
          </Typography>
        </Box>
      ) : (
        <Stack spacing={3}>
          {papers.map((paper) => (
            <Box key={paper.paper_id}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
                  {QB_EXAM_TYPE_LABELS[paper.exam_type as QBExamType] || paper.exam_type}{' '}
                  {paper.year}{paper.session ? ` ${paper.session}` : ''}
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  disabled={applyingPaperId !== null || unresolvedCount[paper.paper_id] > 0}
                  onClick={() => applyPaper(paper.paper_id)}
                  startIcon={applyingPaperId === paper.paper_id ? <CircularProgress size={16} color="inherit" /> : undefined}
                  sx={{ textTransform: 'none', minHeight: 44 }}
                >
                  {unresolvedCount[paper.paper_id] > 0
                    ? `${unresolvedCount[paper.paper_id]} unresolved`
                    : 'Apply to this paper'}
                </Button>
              </Box>
              {paper.collisions.map((collision) => (
                <CollisionReviewGroup
                  key={`${collision.section}-${collision.display_order}`}
                  section={collision.section}
                  display_order={collision.display_order}
                  candidates={collision.candidates}
                  selections={selections[paper.paper_id] || {}}
                  onSelect={(candidateId, section) => select(paper.paper_id, candidateId, section)}
                />
              ))}
            </Box>
          ))}
        </Stack>
      )}

      <Snackbar
        open={snack.open}
        autoHideDuration={5000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity={snack.severity} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
