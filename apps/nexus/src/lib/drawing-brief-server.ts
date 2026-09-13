/**
 * Reading brief types with what is left before each can be switched on.
 */

import { briefReadiness, type BriefReadiness, type ReadinessCriterion } from './drawing-brief-readiness';

export interface BriefTypeSummary {
  id: string;
  key: string;
  title: string;
  description: string | null;
  is_active: boolean;
  activated_at: string | null;
  readiness: BriefReadiness;
}

export async function loadBriefCriteria(supabase: any, briefTypeIds: string[]) {
  if (briefTypeIds.length === 0) return [] as Array<ReadinessCriterion & { brief_type_id: string; observable_checks: string[]; sort_order: number }>;
  const { data, error } = await supabase
    .from('drawing_criterion')
    .select('brief_type_id, key, title, observable_checks, band_descriptions, sort_order')
    .in('brief_type_id', briefTypeIds)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<ReadinessCriterion & { brief_type_id: string; observable_checks: string[]; sort_order: number }>;
}

export async function loadAnchorBands(supabase: any, briefTypeIds: string[]): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (briefTypeIds.length === 0) return out;
  const { data, error } = await supabase
    .from('drawing_anchor_sheet')
    .select('brief_type_id, band')
    .in('brief_type_id', briefTypeIds)
    .eq('is_active', true);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as Array<{ brief_type_id: string; band: number }>) {
    const list = out.get(row.brief_type_id) ?? [];
    list.push(row.band);
    out.set(row.brief_type_id, list);
  }
  return out;
}

const BRIEF_COLUMNS = 'id, key, category, sub_type, title, description, is_active, activated_at';

export async function loadBriefTypes(supabase: any): Promise<BriefTypeSummary[]> {
  let res = await supabase.from('drawing_brief_type').select(BRIEF_COLUMNS).order('title', { ascending: true });
  // Before activated_at exists, the list still loads.
  if (res.error && /activated_at/.test(res.error.message)) {
    res = await supabase.from('drawing_brief_type').select('id, key, category, sub_type, title, description, is_active').order('title', { ascending: true });
  }
  if (res.error) throw new Error(res.error.message);
  const briefs = (res.data ?? []) as Array<Omit<BriefTypeSummary, 'readiness'>>;
  const ids = briefs.map((b) => b.id);
  const [criteria, anchors] = await Promise.all([loadBriefCriteria(supabase, ids), loadAnchorBands(supabase, ids)]);
  return briefs.map((b) => ({
    ...b,
    activated_at: b.activated_at ?? null,
    readiness: briefReadiness(criteria.filter((c) => c.brief_type_id === b.id), anchors.get(b.id) ?? []),
  }));
}

export async function loadBriefByKey(supabase: any, key: string) {
  const { data, error } = await supabase.from('drawing_brief_type').select(BRIEF_COLUMNS).eq('key', key).maybeSingle();
  if (error) throw new Error(error.message);
  return data as (Omit<BriefTypeSummary, 'readiness'> & { category: string; sub_type: string }) | null;
}
