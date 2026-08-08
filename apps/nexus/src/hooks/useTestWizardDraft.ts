'use client';

/**
 * The wizard's draft, wired to the browser.
 *
 * All the logic lives in lib/test-wizard-draft.ts as pure functions. This hook
 * only supplies the three things a browser adds: a reducer, a place to survive
 * a refresh, and the URL.
 *
 * sessionStorage rather than localStorage, deliberately. Per tab, so two tabs
 * building two tests do not fight over one key. Per session, so a draft cannot
 * resurface a week later and be published by accident.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  DRAFT_STORAGE_KEY,
  draftReducer,
  draftShedLevels,
  deserialiseDraft,
  emptyDraft,
  isResumable,
  nextStep,
  parseSourceKind,
  prevStep,
  resolveStep,
  type DraftAction,
  type SourceKind,
  type TestDraft,
  type WizardStep,
} from '@/lib/test-wizard-draft';

/** Long enough that typing a steering sentence does not write on every keystroke. */
const SAVE_DEBOUNCE_MS = 400;

function newDraftId(): string {
  // Only has to be unique within one browser. crypto.randomUUID is not present
  // in every WebView Nexus is opened in, hence the fallback.
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `d${Date.now()}${Math.floor(Math.random() * 1e6)}`;
}

export interface TestWizardDraftApi {
  draft: TestDraft;
  dispatch: (action: DraftAction) => void;
  /** A draft was found in storage and has not been accepted or discarded yet. */
  pendingResume: TestDraft | null;
  resume: () => void;
  discard: () => void;
  goNext: () => void;
  goBack: () => void;
  goTo: (step: WizardStep, source?: SourceKind) => void;
  /** True once the draft holds work worth warning about before leaving. */
  dirty: boolean;
  /** Set when the draft was too large to keep through a refresh. */
  storageWarning: string | null;
}

export function useTestWizardDraft(): TestWizardDraftApi {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [draft, dispatch] = useReducer(draftReducer, null, () =>
    emptyDraft(newDraftId(), new Date().toISOString()),
  );
  const [pendingResume, setPendingResume] = useState<TestDraft | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const hydrated = useRef(false);

  // ── Read whatever the last visit left behind ───────────────────────────────
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    try {
      const stored = deserialiseDraft(sessionStorage.getItem(DRAFT_STORAGE_KEY), Date.now());
      // Offered, never applied silently. A draft that reappears on its own is
      // indistinguishable from a bug, and the teacher may well have moved on.
      if (stored && isResumable(stored)) setPendingResume(stored);
      else if (stored) sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // A blocked or full sessionStorage must not stop the wizard opening.
    }
  }, []);

  const dirty = draft.questions.length > 0 || draft.json.raw.length > 0;

  // ── Keep it through a refresh ──────────────────────────────────────────────
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      // Shed biggest-first until something fits. The questions are never shed,
      // so the worst outcome is losing the raw paste that produced them.
      for (const level of draftShedLevels(draft)) {
        try {
          sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(level));
          setStorageWarning(level === draft ? null : 'This draft is too large to keep through a refresh in full.');
          return;
        } catch {
          // Try the next, smaller level.
        }
      }
      setStorageWarning('This draft is too large to keep through a refresh.');
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, dirty]);

  // ── Warn before the tab closes on unsaved work ─────────────────────────────
  useEffect(() => {
    if (!dirty || draft.step === 'place') return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, draft.step]);

  // ── The URL owns which step renders ────────────────────────────────────────
  const requested = searchParams.get('step');
  const urlSource = parseSourceKind(searchParams.get('src'));

  /**
   * The source as the URL knows it, before the reducer has caught up.
   *
   * A deep link like `?step=generate&src=bank` arrives with an empty draft, so
   * on the very first render `draft.source` is still null. Resolving the step
   * against that alone decided "generate is unreachable", fell back to step 1,
   * and then rewrote the URL, which silently destroyed every deep link into a
   * branch. Seeding from the URL here fixes it before the fallback can fire.
   */
  const effectiveSource = draft.source ?? urlSource;
  const step = useMemo(
    () => resolveStep({ ...draft, source: effectiveSource }, requested),
    [draft, effectiveSource, requested],
  );

  useEffect(() => {
    if (urlSource && !draft.source) dispatch({ type: 'pickSource', source: urlSource });
  }, [urlSource, draft.source]);

  useEffect(() => {
    if (draft.step !== step) dispatch({ type: 'goStep', step });
  }, [step, draft.step]);

  // A step the draft cannot support is rewritten with replace, not push, so
  // Back does not bounce between the illegal URL and the legal one.
  useEffect(() => {
    if (requested && requested !== step) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('step', step);
      router.replace(`?${params.toString()}`, { scroll: false });
    }
  }, [requested, step, router, searchParams]);

  const goTo = useCallback(
    // `source` is passed explicitly by the caller that just dispatched
    // pickSource, because the reducer's new state is not readable in the same
    // tick and the URL would otherwise carry the previous branch.
    (next: WizardStep, source?: SourceKind) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('step', next);
      const src = source ?? draft.source;
      if (src) params.set('src', src);
      // push, so browser Back walks the wizard backwards one step at a time and
      // the last Back leaves it. The old import wizard kept step in useState
      // with no URL, which meant Back at step 3 discarded a 40-question paste.
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams, draft.source],
  );

  const goNext = useCallback(() => {
    const next = nextStep(draft);
    if (next) goTo(next);
  }, [draft, goTo]);

  const goBack = useCallback(() => {
    const prev = prevStep(draft);
    if (prev) router.back();
  }, [draft, router]);

  const resume = useCallback(() => {
    if (!pendingResume) return;
    dispatch({ type: 'hydrate', draft: pendingResume });
    setPendingResume(null);
  }, [pendingResume]);

  const discard = useCallback(() => {
    try {
      sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // Nothing to do; the draft is dropped from memory either way.
    }
    setPendingResume(null);
    dispatch({ type: 'reset', draftId: newDraftId(), createdAt: new Date().toISOString() });
  }, []);

  return { draft, dispatch, pendingResume, resume, discard, goNext, goBack, goTo, dirty, storageWarning };
}

/** Clears the stored draft once a test has actually been published. */
export function clearStoredDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Storage may be blocked. The draft is gone from memory regardless.
  }
}
