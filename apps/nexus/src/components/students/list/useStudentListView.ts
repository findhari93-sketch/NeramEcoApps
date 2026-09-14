'use client';

/**
 * The one hook behind every full list of students: hides dormant students,
 * filters by the stage ring and by the screen's own status, searches and sorts,
 * and keeps all of it in the URL so Back and reload return to the same view.
 *
 * Pair it with <StudentListToolbar view={...} /> and render `view.shown`.
 * The rules themselves live in lib/student-list-view.ts.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStudentStageFacts } from '@/components/students/StudentStageFactsProvider';
import { patchQuery, readSearch } from '@/lib/list-url-state';
import {
  BASE_SORTS,
  BASE_SORT_LABEL,
  DEFAULT_LIST_URL_KEYS,
  countStages,
  dropDormant,
  filterByStages,
  listStateToParams,
  parseListParams,
  searchAndSort,
  type BaseSort,
  type ExtraSort,
  type FactsLookup,
  type ListAccessors,
  type ListState,
  type ListUrlKeys,
  type StageFilterKey,
} from '@/lib/student-list-view';

export interface StudentListViewConfig<T, S extends string = never, F extends string = never> {
  rows: readonly T[] | null | undefined;
  accessors: ListAccessors<T>;
  /** Screen sorts shown before the three base sorts. */
  extraSorts?: readonly ExtraSort<T, S>[];
  defaultSort: BaseSort | S;
  /** The screen's own groups (status cards). Counts respect the stage filter. */
  status?: { of: (row: T) => F; order: readonly F[] };
  /** A filter the screen already owns (for example the test result tiles). Applied before stage and search. */
  prefilter?: (row: T) => boolean;
  /** Keep these dormant rows anyway (a paused student's real attempt). The screen labels them. */
  keepDormant?: (row: T) => boolean;
  /** URL param names, or false to keep state out of the URL. */
  urlKeys?: Partial<ListUrlKeys> | false;
  /** localStorage key that remembers the chosen sort for this screen. */
  storageKey?: string;
}

export interface StudentListView<T, S extends string = never, F extends string = never> {
  /** What to render: visible, filtered, searched and sorted. */
  shown: T[];
  /** Dormant removed and the stage filter applied, nothing else. For a screen's own counts. */
  staged: T[];
  /** Students on the list at all (dormant removed). */
  total: number;
  pausedHidden: number;
  query: string;
  setQuery: (q: string) => void;
  sort: BaseSort | S;
  setSort: (s: BaseSort | S) => void;
  sortOptions: Array<{ key: BaseSort | S; label: string }>;
  stages: StageFilterKey[];
  toggleStage: (s: StageFilterKey) => void;
  clearStages: () => void;
  stageCounts: Record<StageFilterKey, number>;
  /** False until the stage facts load; the stage filter is disabled until then. */
  stageReady: boolean;
  status: F | 'all';
  setStatus: (s: F | 'all') => void;
  statusCounts: Record<F, number>;
  activeFilterCount: number;
  clearAll: () => void;
}

function readStoredSort(key: string | undefined): string | null {
  if (!key) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storeSort(key: string | undefined, sort: string): void {
  if (!key) return;
  try {
    window.localStorage.setItem(key, sort);
  } catch {
    // Private mode or blocked storage: the URL still carries the sort.
  }
}

export function useStudentListView<T, S extends string = never, F extends string = never>(
  config: StudentListViewConfig<T, S, F>,
): StudentListView<T, S, F> {
  const { rows, accessors, extraSorts = [], defaultSort, status: statusConfig, prefilter, keepDormant, urlKeys, storageKey } = config;
  const { factsFor: rawFactsFor, ready: stageReady } = useStudentStageFacts();
  const factsFor = rawFactsFor as FactsLookup;

  const keys: ListUrlKeys | null = urlKeys === false ? null : { ...DEFAULT_LIST_URL_KEYS, ...(urlKeys || {}) };
  const keysSignature = keys ? `${keys.q}|${keys.sort}|${keys.stage}|${keys.status}` : '';

  const [query, setQuery] = useState('');
  const [sort, setSortState] = useState<BaseSort | S>(defaultSort);
  const [stages, setStages] = useState<StageFilterKey[]>([]);
  const [status, setStatus] = useState<F | 'all'>('all');
  // State, not a ref: the URL may only be written from the render AFTER it was
  // read. With a ref, the write effect ran in the same commit as the read and
  // wrote the defaults, and React's dev double-mount then re-read a URL that had
  // just lost its filters (caught by the Class rhythm reload e2e).
  const [urlRead, setUrlRead] = useState(false);

  // A list with no join dates cannot sort by them; offering it would just sort by name.
  const baseSorts: readonly BaseSort[] = accessors.joinedAt ? BASE_SORTS : ['name'];
  const sortKeys = useMemo(
    () => [...extraSorts.map((e) => e.key as string), ...baseSorts],
    // extraSorts is usually a module constant; its keys are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [extraSorts.map((e) => e.key).join('|'), baseSorts.length],
  );
  const statusKeys = useMemo(
    () => (statusConfig?.order ?? []) as readonly string[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [(statusConfig?.order ?? []).join('|')],
  );

  // Read once after mount (never during render, so server and client HTML match).
  useEffect(() => {
    const defaults: ListState = { q: '', sort: defaultSort, stages: [], status: 'all' };
    const stored = readStoredSort(storageKey);
    if (stored && sortKeys.includes(stored)) defaults.sort = stored;
    const state = keys ? parseListParams(readSearch(), { sorts: sortKeys, statuses: statusKeys }, defaults, keys) : defaults;
    setQuery(state.q);
    setSortState(state.sort as BaseSort | S);
    setStages(state.stages);
    setStatus(state.status as F | 'all');
    setUrlRead(true);
    // Mount only: later changes flow the other way, state to URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!urlRead || !keys) return;
    const defaults: ListState = { q: '', sort: defaultSort, stages: [], status: 'all' };
    patchQuery(listStateToParams({ q: query, sort, stages, status }, defaults, keys));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlRead, query, sort, stages, status, keysSignature, defaultSort]);

  const setSort = useCallback(
    (next: BaseSort | S) => {
      setSortState(next);
      storeSort(storageKey, next);
    },
    [storageKey],
  );

  const toggleStage = useCallback((s: StageFilterKey) => {
    setStages((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }, []);
  const clearStages = useCallback(() => setStages([]), []);

  const derived = useMemo(() => {
    const { kept, paused } = dropDormant(rows ?? [], accessors, factsFor, keepDormant);
    const pre = prefilter ? kept.filter(prefilter) : kept;
    const activeStages = stageReady ? stages : [];
    const staged = filterByStages(kept, activeStages, accessors, factsFor);
    const preStaged = filterByStages(pre, activeStages, accessors, factsFor);

    const statusCounts = {} as Record<F, number>;
    if (statusConfig) {
      for (const key of statusConfig.order) statusCounts[key] = 0;
      for (const row of preStaged) statusCounts[statusConfig.of(row)] = (statusCounts[statusConfig.of(row)] ?? 0) + 1;
    }
    const inStatus = (row: T) => !statusConfig || status === 'all' || statusConfig.of(row) === status;

    const stageCounts = countStages(pre.filter(inStatus), accessors, factsFor);
    const filtered = preStaged.filter(inStatus);
    const shown = searchAndSort(filtered, query, sort, accessors, extraSorts);
    return { shown, staged, total: kept.length, pausedHidden: paused, statusCounts, stageCounts };
  }, [rows, accessors, factsFor, prefilter, keepDormant, stageReady, stages, statusConfig, status, query, sort, extraSorts]);

  const sortOptions = useMemo(
    () => [
      ...extraSorts.map((e) => ({ key: e.key as BaseSort | S, label: e.label })),
      ...baseSorts.map((key) => ({ key: key as BaseSort | S, label: BASE_SORT_LABEL[key] })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [extraSorts, baseSorts.length],
  );

  const clearAll = useCallback(() => {
    setQuery('');
    setStages([]);
    setStatus('all');
  }, []);

  return {
    ...derived,
    query,
    setQuery,
    sort,
    setSort,
    sortOptions,
    stages,
    toggleStage,
    clearStages,
    stageReady,
    status,
    setStatus,
    activeFilterCount: stages.length + (status === 'all' ? 0 : 1),
    clearAll,
  };
}
