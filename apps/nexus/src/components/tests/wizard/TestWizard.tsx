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
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useTestWizardDraft, clearStoredDraft } from '@/hooks/useTestWizardDraft';
import type { ImportRegistryTag } from '@/lib/qb-import-schema';
import type { NexusQBQuestionListItem } from '@neram/database';
import { QB_EXAM_TYPE_LABELS } from '@neram/database';
import { buildPaperBlueprint, markingKeyFor, marksForQuestions } from '@/lib/paper-blueprint';
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
import WizardCloseConfirm from './WizardCloseConfirm';
import { wizardCloseHref, wizardFromLabel } from '@/lib/tests-hub-nav';

/**
 * One wizard for every test.
 *
 * Source, generate, review, place. The kind of test is decided by step 4, never
 * by a dropdown, which is what allows the five separate creation paths that
 * used to exist to collapse into this.
 */

/**
 * "JEE Paper 2 2025 Session 1 (forenoon)". Only ever fills a blank title, so a
 * teacher who has already named the test keeps their name.
 */
function paperTitleFor(paper: any): string {
  const exam = QB_EXAM_TYPE_LABELS[paper?.exam_type as keyof typeof QB_EXAM_TYPE_LABELS] || paper?.exam_type || 'Paper';
  return [exam, paper?.year, paper?.session, paper?.shift ? `(${paper.shift})` : null]
    .filter(Boolean)
    .join(' ');
}

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
  const { draft, dispatch, pendingResume, resume, discard, goNext, goBack, goTo, dirty, storageWarning } =
    useTestWizardDraft();

  // The wizard is a full-screen task, so it closes rather than goes back, and it
  // closes to the screen that opened it (a hub tab, or a study material page).
  const from = searchParams.get('from');
  const closeHref = wizardCloseHref(from);
  const fromLabel = wizardFromLabel(from);
  const [confirmClose, setConfirmClose] = useState(false);
  const leave = useCallback(() => {
    setConfirmClose(false);
    discard();
    router.push(closeHref);
  }, [discard, router, closeHref]);
  const requestClose = useCallback(() => {
    if (dirty) setConfirmClose(true);
    else router.push(closeHref);
  }, [dirty, router, closeHref]);

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
  const [importingPaper, setImportingPaper] = useState(false);
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

  /**
   * Load the chosen paper's questions into the draft.
   *
   * This step used to be a dead end. Its primary button called goNext() and
   * nothing else, so draft.questions stayed empty, and because 'faithful' also
   * sets skipReview the wizard jumped Generate straight to Place and then sent
   * `questions: []` to publish, which answers 400 "A test needs at least one
   * question". Every exam-faithful import in the product failed at the last
   * screen.
   *
   * Marks come from the published scheme via the blueprint the panel already
   * fetched, so an imported JEE Paper 2 is +4/-1 with a 50-mark drawing rather
   * than 1 mark a question with no penalty. Questions come back referencing the
   * bank, never re-authored, so importing a paper twice cannot duplicate it.
   */
  const importPaperQuestions = useCallback(async () => {
    const paperId = draft.pyq.paperId;
    if (!paperId) return;

    setImportingPaper(true);
    setError(null);
    try {
      const json = await authFetch(`/api/question-bank/papers/${paperId}`);
      const rows: any[] = json?.data?.questions || [];
      const active = rows.filter((q) => q.is_active !== false);

      if (active.length === 0) {
        setError(
          'That paper has no active questions yet. Finish its answer key and activate it first.',
        );
        return;
      }

      const blueprint =
        draft.pyq.blueprint ??
        buildPaperBlueprint(
          active.reduce<Record<string, number>>((acc, q) => {
            const key = markingKeyFor(q);
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {}),
          json?.data?.paper?.exam_type,
        );

      const { marks, negativeMarks } = marksForQuestions(active, blueprint as any);

      const questions: DraftQuestion[] = active.map((q, i) => ({
        ...bankQuestionToDraft(q as NexusQBQuestionListItem),
        marks: marks[i] ?? 1,
        negative_marks: negativeMarks[i] ?? 0,
      }));

      dispatch({
        type: 'questionsReady',
        questions,
        title: json?.data?.paper ? paperTitleFor(json.data.paper) : undefined,
      });
      goNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that paper');
    } finally {
      setImportingPaper(false);
    }
  }, [authFetch, dispatch, draft.pyq.paperId, draft.pyq.blueprint, goNext]);

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
    (payload: {
      questions: any[];
      proposedTags: any[];
      title: string;
      folderPath: string[];
      /** "Each student gets", from a v3 reply's test.serve or the copied prompt. */
      serve?: number | null;
    }) => {
      dispatch({
        type: 'questionsReady',
        questions: payload.questions.map(importRowToDraft),
        title: payload.title,
        folderPath: payload.folderPath,
      });
      // After questionsReady, so the reducer clamps it against these questions.
      if (typeof payload.serve === 'number' && payload.serve > 0) {
        dispatch({ type: 'patchRules', patch: { questionsToServe: payload.serve } });
      }
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
    // No summary until something is picked: the primary button already says
    // "Review 0 questions", and at 375px this line was squeezed to "Not...".
    if (bankPicked === 0) return undefined;
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
          aria-label={fromLabel ? `Close, back to ${fromLabel.replace(/^From /, '')}` : 'Close, back to tests'}
          onClick={requestClose}
          sx={{ minWidth: 48, minHeight: 48, ml: -1 }}
        >
          <CloseOutlinedIcon />
        </IconButton>
        <Box sx={{ minWidth: 0 }}>
          {fromLabel && (
            <Typography variant="caption" color="text.secondary" component="p" sx={{ lineHeight: 1.2 }}>
              {fromLabel}
            </Typography>
          )}
          <Typography variant="h6" component="h1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
            New test
          </Typography>
        </Box>
      </Box>

      <WizardCloseConfirm
        open={confirmClose}
        questionCount={draft.questions.length}
        onKeep={() => setConfirmClose(false)}
        onDiscard={leave}
      />

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
          onUseWholePaper={(paperId) => {
            // The exam-faithful import keeps its own branch, because it brings
            // sections, marking and timing that a hand-picked list does not.
            // Handing over the id lets that panel open on this paper.
            setBankSelection(new Map());
            dispatch({ type: 'pickSource', source: 'pyq' });
            dispatch({ type: 'patchPyq', patch: { paperId, mode: 'faithful', blueprint: null } });
            goTo('generate', 'pyq');
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
            label: importingPaper
              ? 'Loading the paper...'
              : draft.pyq.mode === 'faithful'
                ? 'Import and place'
                : 'Import and review',
            disabled: !draft.pyq.paperId || importingPaper,
            onClick: importPaperQuestions,
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
