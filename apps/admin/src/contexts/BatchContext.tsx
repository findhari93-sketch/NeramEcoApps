'use client';

/**
 * Exam-year batch context (users.academic_year registry). The single source of
 * truth for "which batch is current" + the list of batches + the "needs batch"
 * worklist counts, so every admin user-list can default to the current batch and
 * render a consistent selector.
 *
 * NOT related to `batches` (course-class schedule) or `nexus_batches` (classroom
 * section) — this is the exam-year cohort only.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import type { AcademicBatch } from '@neram/database';

interface BatchContextValue {
  current: AcademicBatch | null;
  batches: AcademicBatch[];
  needsAssignment: { lead: number; student: number };
  loading: boolean;
  error: string | null;
  refresh: () => void;
  /** The app-wide selected batch. One global switch (in the profile menu) drives
   *  every user-list. 'current' | 'all' | 'none' | a 'YYYY-YY' code. */
  selectedBatch: string;
  setSelectedBatch: (v: string) => void;
  /** selectedBatch resolved to a concrete code (or null for all/none/unknown-current),
   *  handy for dialog defaults and display. */
  resolvedBatchCode: string | null;
}

const defaultValue: BatchContextValue = {
  current: null,
  batches: [],
  needsAssignment: { lead: 0, student: 0 },
  loading: true,
  error: null,
  refresh: () => {},
  selectedBatch: 'current',
  setSelectedBatch: () => {},
  resolvedBatchCode: null,
};

const STORAGE_KEY = 'admin.selectedBatch';

const BatchContext = createContext<BatchContextValue>(defaultValue);

export function BatchProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<AcademicBatch | null>(null);
  const [batches, setBatches] = useState<AcademicBatch[]>([]);
  const [needsAssignment, setNeedsAssignment] = useState({ lead: 0, student: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Global selected batch (defaults to current). Hydrated from localStorage after
  // mount so it sticks across navigation/refresh without an SSR hydration mismatch.
  const [selectedBatch, setSelectedBatchState] = useState<string>('current');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setSelectedBatchState(saved);
    } catch {
      /* ignore storage errors */
    }
  }, []);

  const setSelectedBatch = useCallback((v: string) => {
    setSelectedBatchState(v);
    try {
      window.localStorage.setItem(STORAGE_KEY, v);
    } catch {
      /* ignore storage errors */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/academic-batches', { cache: 'no-store' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load batches');
      }
      const data = await res.json();
      setCurrent(data.current ?? null);
      setBatches(Array.isArray(data.batches) ? data.batches : []);
      setNeedsAssignment(data.needsAssignment ?? { lead: 0, student: 0 });
      setError(null);
    } catch (e: any) {
      console.error('BatchContext load error:', e);
      setError(e.message || 'Failed to load batches');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resolvedBatchCode =
    selectedBatch === 'current'
      ? current?.code ?? null
      : selectedBatch === 'all' || selectedBatch === 'none'
        ? null
        : selectedBatch;

  return (
    <BatchContext.Provider
      value={{
        current,
        batches,
        needsAssignment,
        loading,
        error,
        refresh: load,
        selectedBatch,
        setSelectedBatch,
        resolvedBatchCode,
      }}
    >
      {children}
    </BatchContext.Provider>
  );
}

export function useBatches(): BatchContextValue {
  return useContext(BatchContext);
}
