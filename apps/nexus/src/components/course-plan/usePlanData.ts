'use client';

/**
 * One hook per plan screen: loads the whole plan payload (plan + entries +
 * audit + teachers + tests), runs the flow engine over it, and exposes the
 * mutation helpers every Course Plan screen shares.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthFetch } from '@/components/curriculum/shared';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { computeFlow, toFlowEntries, istToday, type FlowResult } from '@/lib/plan-flow';
import type { PlanData, Entry } from './common';

export interface UsePlanData {
  data: PlanData | null;
  plan: PlanData['plan'] | null;
  flow: FlowResult | null;
  today: string;
  busy: boolean;
  snack: { msg: string; sev: 'success' | 'error' } | null;
  setSnack: (s: { msg: string; sev: 'success' | 'error' } | null) => void;
  load: () => Promise<void>;
  /** POST an entry action to /api/teaching-plans/[id] and reload. */
  act: (body: Record<string, unknown>, msg?: string) => Promise<boolean>;
  /** PATCH plan meta and reload. */
  patch: (updates: Record<string, unknown>, msg?: string) => Promise<boolean>;
  entriesById: Map<string, Entry>;
  authFetch: ReturnType<typeof useAuthFetch>;
}

export function usePlanData(planId: string): UsePlanData {
  const { loading: authLoading } = useNexusAuthContext();
  const authFetch = useAuthFetch();
  const [data, setData] = useState<PlanData | null>(null);
  const [busy, setBusy] = useState(false);
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);
  const today = istToday();

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`/api/teaching-plans/${planId}`);
      setData(res as PlanData);
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to load plan', sev: 'error' });
    }
  }, [authFetch, planId]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  const plan = data?.plan ?? null;

  const flow = useMemo(() => {
    if (!plan) return null;
    return computeFlow(toFlowEntries(plan.entries), {
      startDate: plan.start_date,
      saturdayClasses: plan.saturday_classes ?? true,
      today,
    });
  }, [plan, today]);

  const entriesById = useMemo(
    () => new Map<string, Entry>((plan?.entries ?? []).map((e) => [e.id, e])),
    [plan],
  );

  const act = useCallback(
    async (body: Record<string, unknown>, msg?: string) => {
      setBusy(true);
      try {
        await authFetch(`/api/teaching-plans/${planId}`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        if (msg) setSnack({ msg, sev: 'success' });
        await load();
        return true;
      } catch (err) {
        setSnack({ msg: err instanceof Error ? err.message : 'Failed to save', sev: 'error' });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [authFetch, planId, load],
  );

  const patch = useCallback(
    async (updates: Record<string, unknown>, msg?: string) => {
      setBusy(true);
      try {
        await authFetch(`/api/teaching-plans/${planId}`, {
          method: 'PATCH',
          body: JSON.stringify(updates),
        });
        if (msg) setSnack({ msg, sev: 'success' });
        await load();
        return true;
      } catch (err) {
        setSnack({ msg: err instanceof Error ? err.message : 'Failed to save', sev: 'error' });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [authFetch, planId, load],
  );

  return { data, plan, flow, today, busy, snack, setSnack, load, act, patch, entriesById, authFetch };
}
