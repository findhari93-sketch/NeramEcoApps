// @ts-nocheck — nexus_teaching_plans / entries / audit log not yet in generated Supabase types;
// regenerate with pnpm supabase:gen:types after the migration is applied.
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type {
  NexusTeachingPlan,
  NexusTeachingPlanEntry,
  NexusPlanAuditLog,
  NexusPlanAuditAction,
  NexusCourseTopic,
  NexusPlanDayItem,
  NexusPlanScheduleOverride,
} from '../../types';

const PLANS = 'nexus_teaching_plans';
const ENTRIES = 'nexus_teaching_plan_entries';
const AUDIT = 'nexus_plan_audit_log';
const DAY_ITEMS = 'nexus_plan_day_items';
const SCHEDULE_OVERRIDES = 'nexus_plan_schedule_overrides';

/** Queue positions are spaced by this gap so inserts rarely need a renumber. */
export const POSITION_GAP = 1024;

export interface NexusTeachingPlanEntryDetail extends NexusTeachingPlanEntry {
  topic:
    | (Pick<
        NexusCourseTopic,
        | 'id'
        | 'title'
        | 'priority'
        | 'status'
        | 'estimated_sessions'
        | 'intended_delivery'
        | 'is_self_learning'
        | 'visible_to_students'
      > & { module: { id: string; title: string; color: string | null } | null })
    | null;
  test: { id: string; title: string } | null;
  /** Scheduled classes created from this entry. */
  classes: {
    id: string;
    scheduled_date: string;
    start_time: string | null;
    end_time: string | null;
    teacher_id: string | null;
    teams_meeting_join_url: string | null;
    recording_url: string | null;
    youtube_url: string | null;
    status: string;
    teacher: { id: string; name: string | null } | null;
  }[];
}

export interface NexusTeachingPlanDetail extends NexusTeachingPlan {
  entries: NexusTeachingPlanEntryDetail[];
  /** Cancelled / makeup class-day overrides feeding the flow engine. */
  schedule_overrides: NexusPlanScheduleOverride[];
}

export interface NexusPlanAuditLogDetail extends NexusPlanAuditLog {
  performer: { id: string; name: string | null; avatar_url: string | null } | null;
}

// ============================================================
// Plans
// ============================================================

export interface NexusTeachingPlanCard extends NexusTeachingPlan {
  entry_count: number;
  done_count: number;
  test_count: number;
  topic_count: number;
  module_count: number;
}

export async function listTeachingPlans(
  classroomId?: string | null,
  client?: TypedSupabaseClient,
  options?: { includeArchived?: boolean },
): Promise<NexusTeachingPlanCard[]> {
  const supabase = client || getSupabaseAdminClient();
  let query = supabase
    .from(PLANS)
    .select(
      '*, entries:nexus_teaching_plan_entries(id, status, entry_type, topic:nexus_course_topics(module_id))',
    )
    .order('created_at', { ascending: false });
  if (!options?.includeArchived) query = query.neq('status', 'archived');
  if (classroomId) query = query.eq('classroom_id', classroomId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((p) => {
    const entries = p.entries || [];
    const { entries: _drop, ...plan } = p;
    const topicEntries = entries.filter((e) => e.entry_type !== 'test');
    const modules = new Set(
      topicEntries.map((e) => e.topic?.module_id).filter(Boolean),
    );
    return {
      ...plan,
      entry_count: entries.length,
      done_count: entries.filter((e) => e.status === 'done').length,
      test_count: entries.filter((e) => e.entry_type === 'test').length,
      topic_count: topicEntries.length,
      module_count: modules.size,
    };
  });
}

export async function createTeachingPlan(
  data: {
    classroom_id: string;
    title: string;
    exam_type?: string;
    start_date: string;
    expected_end_date: string;
    created_by: string;
  },
  client?: TypedSupabaseClient,
): Promise<NexusTeachingPlan> {
  const supabase = client || getSupabaseAdminClient();
  const { data: row, error } = await supabase.from(PLANS).insert(data).select().single();
  if (error) throw error;
  return row as NexusTeachingPlan;
}

export async function updateTeachingPlan(
  id: string,
  updates: Partial<NexusTeachingPlan>,
  client?: TypedSupabaseClient,
): Promise<NexusTeachingPlan> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(PLANS)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as NexusTeachingPlan;
}

/** Hard-delete a plan. Cascade removes entries, audit log, day items, catch-up;
 *  scheduled classes survive (plan_entry_id is SET NULL). */
export async function deleteTeachingPlan(
  id: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase.from(PLANS).delete().eq('id', id);
  if (error) throw error;
}

/** Lightweight plan row (id, classroom, title, status) for API-layer checks. */
export async function getPlanMeta(
  planId: string,
  client?: TypedSupabaseClient,
): Promise<Pick<NexusTeachingPlan, 'id' | 'classroom_id' | 'title' | 'status'> | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(PLANS)
    .select('id, classroom_id, title, status')
    .eq('id', planId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

/** One entry with its topic (title + summary) and test titles, for audit text + scheduling. */
export async function getPlanEntryWithRefs(
  entryId: string,
  client?: TypedSupabaseClient,
): Promise<
  | (NexusTeachingPlanEntry & {
      topic: { id: string; title: string; summary: string | null } | null;
      test: { id: string; title: string } | null;
    })
  | null
> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(ENTRIES)
    .select('*, topic:nexus_course_topics(id, title, summary), test:nexus_tests(id, title)')
    .eq('id', entryId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

/** Plan with entries (topic + module + linked scheduled classes), ordered for the board. */
export async function getTeachingPlanWithEntries(
  planId: string,
  client?: TypedSupabaseClient,
): Promise<NexusTeachingPlanDetail | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data: plan, error } = await supabase.from(PLANS).select('*').eq('id', planId).single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  const { data: entries, error: entErr } = await supabase
    .from(ENTRIES)
    .select(
      '*, topic:nexus_course_topics(id, title, priority, status, estimated_sessions, intended_delivery, ' +
        'is_self_learning, visible_to_students, ' +
        'module:nexus_course_modules(id, title, color)), ' +
        'test:nexus_tests(id, title), ' +
        'classes:nexus_scheduled_classes!plan_entry_id(id, scheduled_date, start_time, end_time, ' +
        'teacher_id, teams_meeting_join_url, recording_url, youtube_url, status, ' +
        'teacher:users!nexus_scheduled_classes_teacher_id_fkey(id, name))',
    )
    .eq('plan_id', planId)
    .order('position', { ascending: true });
  if (entErr) throw entErr;
  const schedule_overrides = await listPlanScheduleOverrides(planId, supabase);
  return { ...plan, entries: entries || [], schedule_overrides } as NexusTeachingPlanDetail;
}

// ============================================================
// Schedule overrides (cancel / makeup class days)
// ============================================================

/**
 * All cancel/makeup overrides for a plan. Soft-fails to [] if the table is not
 * migrated yet, so the plan still loads before the migration is applied.
 */
export async function listPlanScheduleOverrides(
  planId: string,
  client?: TypedSupabaseClient,
): Promise<NexusPlanScheduleOverride[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(SCHEDULE_OVERRIDES)
    .select('*')
    .eq('plan_id', planId)
    .order('date', { ascending: true });
  if (error) {
    // Table not migrated yet -> treat as "no overrides" so the plan still loads.
    // 42P01 = Postgres undefined_table; PGRST205 = PostgREST schema-cache miss.
    const code = (error as { code?: string }).code;
    if (code === '42P01' || code === 'PGRST205' || /schema cache|does not exist/i.test(error.message || '')) {
      return [];
    }
    throw error;
  }
  return (data || []) as NexusPlanScheduleOverride[];
}

/** Add (or replace) a cancel/makeup override for one date. */
export async function addPlanScheduleOverride(
  data: { plan_id: string; date: string; kind: 'cancelled' | 'makeup'; reason?: string | null; created_by: string },
  client?: TypedSupabaseClient,
): Promise<NexusPlanScheduleOverride> {
  const supabase = client || getSupabaseAdminClient();
  const { data: row, error } = await supabase
    .from(SCHEDULE_OVERRIDES)
    .upsert(
      { plan_id: data.plan_id, date: data.date, kind: data.kind, reason: data.reason ?? null, created_by: data.created_by },
      { onConflict: 'plan_id,date' },
    )
    .select()
    .single();
  if (error) throw error;
  return row as NexusPlanScheduleOverride;
}

/** Remove the override on a date (undo a cancel or makeup). */
export async function removePlanScheduleOverride(
  planId: string,
  date: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase
    .from(SCHEDULE_OVERRIDES)
    .delete()
    .eq('plan_id', planId)
    .eq('date', date);
  if (error) throw error;
}

// ============================================================
// Entries
// ============================================================

/** Ordered (id, position) pairs of a plan's queue, for insert-position math. */
export async function listEntryPositions(
  planId: string,
  client?: TypedSupabaseClient,
): Promise<{ id: string; position: number; entry_type: string }[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(ENTRIES)
    .select('id, position, entry_type')
    .eq('plan_id', planId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * Insert entries into the queue. `afterPosition` = insert right after that
 * position (undefined = append at the end).
 */
export async function addPlanEntries(
  planId: string,
  entries: {
    topic_id?: string | null;
    test_id?: string | null;
    label?: string | null;
    entry_type?: string;
    planned_date?: string | null;
    is_unplanned?: boolean;
    session_span?: number | null;
    notes?: string | null;
    task_time?: string | null;
  }[],
  options?: { afterPosition?: number; client?: TypedSupabaseClient },
): Promise<NexusTeachingPlanEntry[]> {
  const supabase = options?.client || getSupabaseAdminClient();
  const existing = await listEntryPositions(planId, supabase);
  let positions: number[];
  if (options?.afterPosition === undefined) {
    const max = existing.length ? existing[existing.length - 1].position : 0;
    positions = entries.map((_, i) => max + POSITION_GAP * (i + 1));
  } else {
    const after = options.afterPosition;
    const next = existing.find((e) => e.position > after)?.position;
    if (next === undefined) {
      positions = entries.map((_, i) => after + POSITION_GAP * (i + 1));
    } else {
      const gap = (next - after) / (entries.length + 1);
      if (gap < 1) {
        await renumberPlanEntries(planId, supabase);
        return addPlanEntries(planId, entries, { ...options, client: supabase });
      }
      positions = entries.map((_, i) => Math.floor(after + gap * (i + 1)));
    }
  }
  // PostgREST bulk inserts require every row to carry the SAME keys, so
  // normalize each entry to the full column set. task_time is only included
  // when a task is being added, so ordinary inserts never reference the column.
  const hasTaskTime = entries.some((e) => e.task_time !== undefined);
  const { data, error } = await supabase
    .from(ENTRIES)
    .insert(
      entries.map((e, i) => ({
        plan_id: planId,
        position: positions[i],
        topic_id: e.topic_id ?? null,
        test_id: e.test_id ?? null,
        label: e.label ?? null,
        entry_type: e.entry_type ?? 'live_class',
        planned_date: e.planned_date ?? null,
        is_unplanned: e.is_unplanned ?? false,
        session_span: e.session_span ?? null,
        notes: e.notes ?? null,
        ...(hasTaskTime ? { task_time: e.task_time ?? null } : {}),
      })),
    )
    .select();
  if (error) throw error;
  return (data || []) as NexusTeachingPlanEntry[];
}

/** Rewrite all positions with even POSITION_GAP spacing, preserving order. */
export async function renumberPlanEntries(
  planId: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const existing = await listEntryPositions(planId, supabase);
  for (let i = 0; i < existing.length; i++) {
    const wanted = (i + 1) * POSITION_GAP;
    if (existing[i].position !== wanted) {
      const { error } = await supabase
        .from(ENTRIES)
        .update({ position: wanted })
        .eq('id', existing[i].id);
      if (error) throw error;
    }
  }
}

/**
 * Move an entry after another entry (or to the start of the queue).
 * Returns the entry's new position.
 */
export async function reorderPlanEntry(
  planId: string,
  entryId: string,
  target: { afterEntryId?: string | null; toStart?: boolean },
  client?: TypedSupabaseClient,
): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  const existing = await listEntryPositions(planId, supabase);
  const others = existing.filter((e) => e.id !== entryId);
  let newPos: number;
  if (target.toStart || !target.afterEntryId) {
    const first = others[0];
    newPos = first ? Math.floor(first.position / 2) : POSITION_GAP;
    if (newPos < 1 || (first && newPos >= first.position)) {
      await renumberPlanEntries(planId, supabase);
      return reorderPlanEntry(planId, entryId, target, supabase);
    }
  } else {
    const idx = others.findIndex((e) => e.id === target.afterEntryId);
    if (idx === -1) throw new Error('after_entry_id not found in plan');
    const after = others[idx].position;
    const next = others[idx + 1]?.position;
    if (next === undefined) {
      newPos = after + POSITION_GAP;
    } else {
      newPos = Math.floor((after + next) / 2);
      if (newPos <= after || newPos >= next) {
        await renumberPlanEntries(planId, supabase);
        return reorderPlanEntry(planId, entryId, target, supabase);
      }
    }
  }
  const { error } = await supabase
    .from(ENTRIES)
    .update({ position: newPos, updated_at: new Date().toISOString() })
    .eq('id', entryId);
  if (error) throw error;
  return newPos;
}

export async function updatePlanEntry(
  entryId: string,
  updates: Partial<NexusTeachingPlanEntry>,
  client?: TypedSupabaseClient,
): Promise<NexusTeachingPlanEntry> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(ENTRIES)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', entryId)
    .select()
    .single();
  if (error) throw error;
  return data as NexusTeachingPlanEntry;
}

export async function removePlanEntry(
  entryId: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase.from(ENTRIES).delete().eq('id', entryId);
  if (error) throw error;
}

// ============================================================
// Audit log (the Activity feed)
// ============================================================

export async function logPlanAudit(
  data: {
    plan_id: string;
    entry_id?: string | null;
    action: NexusPlanAuditAction;
    performed_by: string;
    metadata?: Record<string, unknown>;
  },
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase.from(AUDIT).insert(data);
  // Audit writes must never fail the mutation they describe.
  if (error) console.error('logPlanAudit failed:', error.message);
}

export async function listPlanAudit(
  planId: string,
  limit = 100,
  client?: TypedSupabaseClient,
): Promise<NexusPlanAuditLogDetail[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(AUDIT)
    .select('*, performer:users(id, name, avatar_url)')
    .eq('plan_id', planId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as NexusPlanAuditLogDetail[];
}

// ============================================================
// Class Day agenda items
// ============================================================

export async function listDayItems(
  planId: string,
  classDate: string,
  client?: TypedSupabaseClient,
): Promise<NexusPlanDayItem[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(DAY_ITEMS)
    .select('*')
    .eq('plan_id', planId)
    .eq('class_date', classDate)
    .order('position', { ascending: true });
  if (error) throw error;
  return (data || []) as NexusPlanDayItem[];
}

export async function insertDayItems(
  items: {
    plan_id: string;
    entry_id?: string | null;
    class_date: string;
    title: string;
    topic_id?: string | null;
    is_unplanned?: boolean;
    source?: 'seeded' | 'manual';
    position?: number;
    created_by?: string | null;
  }[],
  client?: TypedSupabaseClient,
): Promise<NexusPlanDayItem[]> {
  if (!items.length) return [];
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase.from(DAY_ITEMS).insert(items).select();
  if (error) throw error;
  return (data || []) as NexusPlanDayItem[];
}

export async function updateDayItem(
  itemId: string,
  updates: Partial<Pick<NexusPlanDayItem, 'status' | 'title' | 'position'>>,
  client?: TypedSupabaseClient,
): Promise<NexusPlanDayItem> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(DAY_ITEMS)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .select()
    .single();
  if (error) throw error;
  return data as NexusPlanDayItem;
}
