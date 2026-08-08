'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  IconButton,
  Paper,
  Snackbar,
  Typography,
} from '@neram/ui';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useTestWizardDraft, clearStoredDraft } from '@/hooks/useTestWizardDraft';
import type { ImportRegistryTag } from '@/lib/qb-import-schema';
import type { NexusQBQuestionListItem } from '@neram/database';
import {
  activeQuestions,
  estimatedMinutes,
  inferTestKind,
  isPublishable,
  placementRequests,
  totalMarks,
  type DraftQuestion,
  type PlacementChoice,
  type SourceKind,
} from '@/lib/test-wizard-draft';
import WizardStepper from './WizardStepper';
import StickyWizardBar from './StickyWizardBar';
import StepSource from './StepSource';
import SourceAiPanel from './SourceAiPanel';
import SourceJsonPanel from './SourceJsonPanel';
import SourceBankPanel, { bankQuestionToDraft } from './SourceBankPanel';
import SourcePyqPanel from './SourcePyqPanel';
import StepReview from './StepReview';
import StepPlace from './StepPlace';

/**
 * One wizard for every test.
 *
 * Source, generate, review, place. The kind of test is decided by step 4, never
 * by a dropdown, which is what allows the five separate creation paths that
 * used to exist to collapse into this.
 */

/** An import row carries fields DraftQuestion needs defaults for. */
function importRowToDraft(q: any, i: number): DraftQuestion {
  return {
    key: q.key || `q${i}`,
    bank_question_id: null,
    question_text: q.question_text || '',
    question_format: q.question_format === 'NUMERICAL' ? 'NUMERICAL' : 'MCQ',
    options: q.options ?? null,
    correct_answer: q.correct_answer || '',
    explanation: q.explanation ?? null,
    source_quote: q.source_quote ?? null,
    image_ref: q.image_ref ?? null,
    difficulty: q.difficulty || 'MEDIUM',
    exam_relevance: q.exam_relevance || 'BOTH',
    tag_ids: q.tag_ids || [],
    tag_slugs: q.tag_slugs || [],
    new_tag_slugs: q.new_tag_slugs || [],
    marks: 1,
    negative_marks: 0,
    action: 'create',
    existing_question_id: null,
    candidates: [],
  };
}

export default function TestWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getToken, isTeacher, activeClassroom } = useNexusAuthContext();
  const { draft, dispatch, pendingResume, resume, discard, goNext, goBack, goTo, storageWarning } =
    useTestWizardDraft();

  const [registry, setRegistry] = useState<ImportRegistryTag[]>([]);
  /**
   * The picker's controlled selection.
   *
   * Mirrored into the draft on every change rather than kept as a second source
   * of truth, so a refresh mid-pick restores the questions like every other
   * branch. Seeded from the draft on mount for the same reason.
   */
  const [bankSelection, setBankSelection] = useState<Map<string, NexusQBQuestionListItem>>(new Map());
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  /**
   * Throws an Error that KEEPS the server's extra fields.
   *
   * The usual helper in this app does `throw new Error(json.error)`, which
   * discards manualPrompt, and manualPrompt is the entire point of the 409 the
   * generate route answers with when the budget is spent.
   */
  const authFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init?.headers || {}),
        },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(json.error || 'Request failed');
        Object.assign(err, json);
        throw err;
      }
      return json;
    },
    [getToken],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await authFetch('/api/question-bank/tags');
        if (cancelled) return;
        setRegistry(
          (json.data || []).map((t: any) => ({
            id: t.id,
            slug: t.slug,
            label: t.label,
            group_type: t.group_type,
          })),
        );
      } catch {
        // The registry only enriches tags. A test can be built without it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch]);

  // A deep link's `?src=` is applied inside useTestWizardDraft, because the
  // step has to be resolved against it on the very first render.

  // Seed the picker from a resumed draft, so its ticks are where the teacher
  // left them rather than blank over a draft that still holds the questions.
  useEffect(() => {
    if (draft.source !== 'bank' || bankSelection.size > 0) return;
    const seeded = new Map<string, NexusQBQuestionListItem>();
    for (const q of draft.questions) {
      if (q.bank_question_id) {
        seeded.set(q.bank_question_id, {
          id: q.bank_question_id,
          question_text: q.question_text,
        } as NexusQBQuestionListItem);
      }
    }
    if (seeded.size > 0) setBankSelection(seeded);
  }, [draft.source, draft.questions, bankSelection.size]);

  const questionsReady = useCallback(
    (payload: { questions: any[]; proposedTags: any[]; title: string; folderPath: string[] }) => {
      dispatch({
        type: 'questionsReady',
        questions: payload.questions.map(importRowToDraft),
        title: payload.title,
        folderPath: payload.folderPath,
      });
      dispatch({
        type: 'setProposedTags',
        tags: (payload.proposedTags || []).map((t: any) => ({ ...t, approved: true })),
      });
      goTo('review');
    },
    [dispatch, goTo],
  );

  const togglePlacement = useCallback(
    (kind: PlacementChoice['kind'], on: boolean) => {
      const without = draft.placements.filter((p) => p.kind !== kind);
      if (!on) {
        dispatch({ type: 'setPlacements', placements: without });
        return;
      }
      const classroomId = activeClassroom?.id || '';
      const label = activeClassroom?.name || 'this class';
      const added: PlacementChoice =
        kind === 'class_test'
          ? { kind, classId: classroomId, label, dueAt: null }
          : kind === 'chapter'
            ? { kind, fileId: '', label }
            : kind === 'practice'
              ? { kind, classroomId, label }
              : { kind, classroomId, label, availableFrom: null };
      dispatch({ type: 'setPlacements', placements: [...without, added] });
    },
    [draft.placements, dispatch, activeClassroom],
  );

  const schedulePlacement = useCallback(
    (kind: PlacementChoice['kind'], when: string) => {
      dispatch({
        type: 'setPlacements',
        placements: draft.placements.map((p) => {
          if (p.kind !== kind) return p;
          if (p.kind === 'class_test') return { ...p, dueAt: when || null };
          if (p.kind === 'weekly' || p.kind === 'mock') return { ...p, availableFrom: when || null };
          return p;
        }),
      });
    },
    [draft.placements, dispatch],
  );

  const publish = useCallback(async () => {
    setPublishing(true);
    setError(null);
    try {
      const reqs = placementRequests(draft);
      const json = await authFetch('/api/question-bank/tests/publish', {
        method: 'POST',
        body: JSON.stringify({
          title: draft.title,
          folder_id: draft.folderId,
          folder_path: draft.folderPath,
          source: draft.source,
          test_kind: inferTestKind(draft),
          rules: draft.rules,
          questions: activeQuestions(draft),
          proposed_tags: draft.proposedTags.filter((t) => t.approved),
          // Only the generic placements travel here. A class test is made from
          // the timetable route, which is the only one that writes its gating.
          placements: reqs.filter((r) => r.via === 'placements').map((r) => r.body),
          publish: true,
          created_from: `wizard_${draft.source ?? 'blank'}`,
        }),
      });

      const testId = json.data.test_id;

      // A class test goes through the timetable route, not the generic
      // placements one, because that route is the only thing that writes
      // gating.due_at and gating.required, and the catch-up reader treats a
      // missing `required` as true. Failures here are reported, never fatal:
      // the test itself already exists and is in the library.
      for (const r of reqs) {
        if (r.via !== 'class-test') continue;
        try {
          await authFetch(`/api/timetable/${r.classId}/class-test`, {
            method: 'POST',
            body: JSON.stringify({ ...r.body, test_id: testId }),
          });
        } catch (err) {
          setError(
            `The test was created, but it could not be set for the class: ${
              err instanceof Error ? err.message : 'unknown error'
            }`,
          );
        }
      }

      const refused = (json.data.placements || []).filter((p: any) => !p.ok);
      clearStoredDraft();
      if (refused.length > 0) {
        setError(`Test created. ${refused.map((p: any) => p.error).join(' ')}`);
      }
      setToast('Test published');
      router.push(`/teacher/tests/${testId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish the test');
    } finally {
      setPublishing(false);
    }
  }, [draft, authFetch, router]);

  // Read off the draft, not the Map, so a resumed draft shows the right count
  // even before the picker has re-fetched the rows behind it.
  const bankPicked = draft.source === 'bank' ? activeQuestions(draft).length : 0;
  const bankSummary = useMemo(() => {
    if (bankPicked === 0) return 'Nothing picked yet';
    return `${bankPicked} selected · ${bankPicked} mark${bankPicked === 1 ? '' : 's'} · about ${estimatedMinutes(draft)} min`;
  }, [bankPicked, draft]);

  if (!isTeacher) {
    return (
      <Box sx={{ px: { xs: 2, md: 3 }, py: 6, textAlign: 'center' }}>
        <Typography color="text.secondary">Only teachers can build tests.</Typography>
      </Box>
    );
  }

  const step = draft.step;

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2, pb: { xs: 20, md: 14 }, maxWidth: 1100, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <IconButton
          aria-label="Back to tests"
          onClick={() => router.push('/teacher/tests')}
          sx={{ minWidth: 48, minHeight: 48, ml: -1 }}
        >
          <ArrowBackOutlinedIcon />
        </IconButton>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          New test
        </Typography>
      </Box>

      <WizardStepper step={step} />

      {pendingResume && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2, borderColor: 'primary.light' }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            You have an unfinished test with {pendingResume.questions.length} question
            {pendingResume.questions.length === 1 ? '' : 's'}.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            <Button variant="contained" onClick={resume} sx={{ textTransform: 'none', minHeight: 44 }}>
              Continue it
            </Button>
            <Button onClick={discard} sx={{ textTransform: 'none', minHeight: 44 }}>
              Start fresh
            </Button>
          </Box>
        </Paper>
      )}

      {storageWarning && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {storageWarning}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {step === 'source' && (
        <StepSource
          onPick={(kind) => {
            dispatch({ type: 'pickSource', source: kind });
            // The navigation is the step change. The reducer only records WHICH
            // source, so that Back pops to a URL that still means step 1.
            goTo(kind === 'blank' ? 'review' : 'generate', kind);
          }}
        />
      )}

      {step === 'generate' && draft.source === 'ai' && (
        <SourceAiPanel
          draft={draft}
          onPatch={(patch) => dispatch({ type: 'patchAi', patch })}
          onGenerated={questionsReady}
          authFetch={authFetch}
          classroomId={activeClassroom?.id ?? null}
        />
      )}
      {step === 'generate' && draft.source === 'json' && (
        <SourceJsonPanel
          draft={draft}
          registry={registry}
          onPatch={(patch) => dispatch({ type: 'patchJson', patch })}
          onParsed={questionsReady}
        />
      )}
      {step === 'generate' && draft.source === 'bank' && (
        <SourceBankPanel
          getToken={getToken}
          selected={bankSelection}
          onChange={(next) => {
            setBankSelection(next);
            // The draft is what survives a refresh, so the pick lands there too.
            dispatch({
              type: 'questionsReady',
              questions: [...next.values()].map(bankQuestionToDraft),
            });
            dispatch({ type: 'patchBank', patch: { selectedIds: [...next.keys()] } });
          }}
        />
      )}
      {step === 'generate' && draft.source === 'pyq' && (
        <SourcePyqPanel
          draft={draft}
          onPatch={(patch) => dispatch({ type: 'patchPyq', patch })}
          authFetch={authFetch}
        />
      )}

      {step === 'review' && (
        <StepReview
          draft={draft}
          onUpdateQuestion={(key, patch) => dispatch({ type: 'updateQuestion', key, patch })}
          onRemoveQuestion={(key) => dispatch({ type: 'removeQuestion', key })}
        />
      )}

      {step === 'place' && (
        <StepPlace
          draft={draft}
          classroomName={activeClassroom?.name ?? null}
          classroomId={activeClassroom?.id ?? null}
          onRules={(patch) => dispatch({ type: 'patchRules', patch })}
          onTitle={(title) => dispatch({ type: 'setTitle', title })}
          onFolder={(folderId, folderPath) => dispatch({ type: 'setFolder', folderId, folderPath })}
          onTogglePlacement={togglePlacement}
          onSchedulePlacement={schedulePlacement}
          authFetch={authFetch}
        />
      )}

      {/* Step 2's own branches carry their primary action, because "Generate"
          and "Continue" are different promises and must not share a button. */}
      {step === 'generate' && draft.source === 'bank' && (
        <StickyWizardBar
          summary={bankSummary}
          secondary={{ label: 'Back', onClick: goBack }}
          primary={{
            label: `Review ${bankPicked} question${bankPicked === 1 ? '' : 's'}`,
            disabled: bankPicked === 0,
            onClick: () => goTo('review'),
          }}
        />
      )}

      {step === 'generate' && draft.source === 'pyq' && (
        <StickyWizardBar
          secondary={{ label: 'Back', onClick: goBack }}
          primary={{
            label: draft.pyq.mode === 'faithful' ? 'Import and place' : 'Import and review',
            disabled: !draft.pyq.paperId,
            onClick: goNext,
          }}
        />
      )}

      {step === 'review' && (
        <StickyWizardBar
          summary={`${activeQuestions(draft).length} questions · ${totalMarks(draft)} marks · about ${estimatedMinutes(draft)} min`}
          secondary={{ label: 'Back', onClick: goBack }}
          primary={{
            label: 'Continue to rules',
            disabled: activeQuestions(draft).length === 0,
            onClick: goNext,
          }}
        />
      )}

      {step === 'place' && (
        <StickyWizardBar
          secondary={{ label: 'Back', onClick: goBack }}
          primary={{
            label: 'Publish test',
            disabled: !isPublishable(draft),
            busy: publishing,
            onClick: publish,
          }}
        />
      )}

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        message={toast ?? ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ mb: 10 }}
      />
    </Box>
  );
}
