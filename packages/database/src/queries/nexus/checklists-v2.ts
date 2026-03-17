import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type {
  NexusChecklist,
  NexusChecklistEntry,
  NexusChecklistEntryResource,
  NexusChecklistClassroom,
  NexusChecklistWithEntries,
  NexusChecklistForStudent,
} from '../../types';

// ============================================
// CHECKLIST CRUD
// ============================================

export async function getChecklists(client?: TypedSupabaseClient) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from('nexus_checklists')
    .select(`
      *,
      entries:nexus_checklist_entries(count),
      classrooms:nexus_checklist_classrooms(*, classroom:nexus_classrooms(id, name))
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as any[];
}

export async function getChecklistByIdV2(
  checklistId: string,
  client?: TypedSupabaseClient
): Promise<NexusChecklistWithEntries | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from('nexus_checklists')
    .select(`
      *,
      entries:nexus_checklist_entries(
        *,
        module:nexus_modules(*, items:nexus_module_items(*)),
        resources:nexus_checklist_entry_resources(*)
      ),
      classrooms:nexus_checklist_classrooms(*)
    `)
    .eq('id', checklistId)
    .order('sort_order', { referencedTable: 'nexus_checklist_entries', ascending: true })
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as NexusChecklistWithEntries;
}

export async function createChecklist(
  data: { title: string; description?: string; created_by?: string },
  client?: TypedSupabaseClient
): Promise<NexusChecklist> {
  const supabase = client || getSupabaseAdminClient();
  const { data: checklist, error } = await (supabase as any)
    .from('nexus_checklists')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return checklist as NexusChecklist;
}

export async function updateChecklist(
  checklistId: string,
  updates: Partial<Pick<NexusChecklist, 'title' | 'description' | 'is_active'>>,
  client?: TypedSupabaseClient
): Promise<NexusChecklist> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from('nexus_checklists')
    .update(updates)
    .eq('id', checklistId)
    .select()
    .single();
  if (error) throw error;
  return data as NexusChecklist;
}

// ============================================
// CHECKLIST ENTRIES
// ============================================

export async function addChecklistModuleEntry(
  data: { checklist_id: string; module_id: string; sort_order?: number },
  client?: TypedSupabaseClient
): Promise<NexusChecklistEntry> {
  const supabase = client || getSupabaseAdminClient();
  const { data: entry, error } = await (supabase as any)
    .from('nexus_checklist_entries')
    .insert({ ...data, entry_type: 'module' })
    .select()
    .single();
  if (error) throw error;
  return entry as NexusChecklistEntry;
}

export async function addChecklistSimpleEntry(
  data: {
    checklist_id: string;
    title: string;
    topic_id?: string;
    sort_order?: number;
    resources?: { resource_type: string; url: string }[];
  },
  client?: TypedSupabaseClient
): Promise<NexusChecklistEntry> {
  const supabase = client || getSupabaseAdminClient();
  const { resources, ...entryData } = data;

  const { data: entry, error } = await (supabase as any)
    .from('nexus_checklist_entries')
    .insert({ ...entryData, entry_type: 'simple_item' })
    .select()
    .single();
  if (error) throw error;

  if (resources && resources.length > 0) {
    const resourceRows = resources.map((r) => ({
      entry_id: (entry as any).id,
      ...r,
    }));
    const { error: resError } = await (supabase as any)
      .from('nexus_checklist_entry_resources')
      .insert(resourceRows);
    if (resError) throw resError;
  }

  return entry as NexusChecklistEntry;
}

export async function removeChecklistEntry(
  entryId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await (supabase as any)
    .from('nexus_checklist_entries')
    .delete()
    .eq('id', entryId);
  if (error) throw error;
}

export async function reorderChecklistEntries(
  entries: { id: string; sort_order: number }[],
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  for (const entry of entries) {
    const { error } = await (supabase as any)
      .from('nexus_checklist_entries')
      .update({ sort_order: entry.sort_order })
      .eq('id', entry.id);
    if (error) throw error;
  }
}

// ============================================
// CLASSROOM ASSIGNMENT
// ============================================

export async function assignChecklistToClassrooms(
  checklistId: string,
  classroomIds: string[],
  client?: TypedSupabaseClient
): Promise<NexusChecklistClassroom[]> {
  const supabase = client || getSupabaseAdminClient();
  const rows = classroomIds.map((cid) => ({
    checklist_id: checklistId,
    classroom_id: cid,
  }));
  const { data, error } = await (supabase as any)
    .from('nexus_checklist_classrooms')
    .upsert(rows, { onConflict: 'checklist_id,classroom_id' })
    .select();
  if (error) throw error;
  return (data || []) as NexusChecklistClassroom[];
}

export async function unassignChecklistFromClassroom(
  checklistId: string,
  classroomId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await (supabase as any)
    .from('nexus_checklist_classrooms')
    .delete()
    .eq('checklist_id', checklistId)
    .eq('classroom_id', classroomId);
  if (error) throw error;
}

// ============================================
// STUDENT VIEW
// ============================================

export async function getChecklistsByClassroomV2(
  classroomId: string,
  studentId?: string,
  client?: TypedSupabaseClient
): Promise<NexusChecklistForStudent[]> {
  const supabase = client || getSupabaseAdminClient();

  // Get checklist IDs assigned to this classroom
  const { data: assignments, error: aErr } = await (supabase as any)
    .from('nexus_checklist_classrooms')
    .select('checklist_id')
    .eq('classroom_id', classroomId);
  if (aErr) throw aErr;
  if (!assignments || assignments.length === 0) return [];

  const checklistIds = assignments.map((a: any) => a.checklist_id);

  // Fetch checklists with entries
  const { data: checklists, error: cErr } = await (supabase as any)
    .from('nexus_checklists')
    .select(`
      *,
      entries:nexus_checklist_entries(
        *,
        module:nexus_modules(*, items:nexus_module_items(*)),
        resources:nexus_checklist_entry_resources(*)
      )
    `)
    .in('id', checklistIds)
    .eq('is_active', true)
    .eq('is_published', true)
    .order('sort_order', { referencedTable: 'nexus_checklist_entries', ascending: true });
  if (cErr) throw cErr;

  if (!studentId) return (checklists || []) as NexusChecklistForStudent[];

  // Fetch student progress for simple entries
  const entryIds = (checklists || []).flatMap((cl: any) =>
    (cl.entries || []).filter((e: any) => e.entry_type === 'simple_item').map((e: any) => e.id)
  );

  const moduleItemIds = (checklists || []).flatMap((cl: any) =>
    (cl.entries || []).filter((e: any) => e.entry_type === 'module' && e.module).flatMap((e: any) =>
      (e.module.items || []).map((i: any) => i.id)
    )
  );

  const [entryProgress, moduleItemProgress] = await Promise.all([
    entryIds.length > 0
      ? (supabase as any)
          .from('nexus_student_entry_progress')
          .select('*')
          .eq('student_id', studentId)
          .in('entry_id', entryIds)
          .then((r: any) => r.data || [])
      : Promise.resolve([]),
    moduleItemIds.length > 0
      ? (supabase as any)
          .from('nexus_student_module_item_progress')
          .select('*')
          .eq('student_id', studentId)
          .in('module_item_id', moduleItemIds)
          .then((r: any) => r.data || [])
      : Promise.resolve([]),
  ]);

  const entryProgressMap = new Map(entryProgress.map((p: any) => [p.entry_id, p]));
  const moduleItemProgressMap = new Map(moduleItemProgress.map((p: any) => [p.module_item_id, p]));

  return (checklists || []).map((cl: any) => ({
    ...cl,
    entries: (cl.entries || []).map((entry: any) => ({
      ...entry,
      progress: entry.entry_type === 'simple_item' ? (entryProgressMap.get(entry.id) || null) : null,
      module_item_progress:
        entry.entry_type === 'module' && entry.module
          ? (entry.module.items || []).map((item: any) => moduleItemProgressMap.get(item.id)).filter(Boolean)
          : undefined,
    })),
  })) as NexusChecklistForStudent[];
}

// ============================================
// PROGRESS TRACKING
// ============================================

export async function toggleEntryProgress(
  studentId: string,
  entryId: string,
  isCompleted: boolean,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from('nexus_student_entry_progress')
    .upsert(
      {
        student_id: studentId,
        entry_id: entryId,
        is_completed: isCompleted,
        completed_at: isCompleted ? new Date().toISOString() : null,
      },
      { onConflict: 'student_id,entry_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function toggleModuleItemProgress(
  studentId: string,
  moduleItemId: string,
  isCompleted: boolean,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from('nexus_student_module_item_progress')
    .upsert(
      {
        student_id: studentId,
        module_item_id: moduleItemId,
        is_completed: isCompleted,
        completed_at: isCompleted ? new Date().toISOString() : null,
      },
      { onConflict: 'student_id,module_item_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ============================================
// STATUS-BASED PROGRESS (start / complete)
// ============================================

export async function updateEntryStatus(
  studentId: string,
  entryId: string,
  action: 'start' | 'complete',
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const now = new Date().toISOString();

  if (action === 'start') {
    const { data, error } = await (supabase as any)
      .from('nexus_student_entry_progress')
      .upsert(
        {
          student_id: studentId,
          entry_id: entryId,
          status: 'in_progress',
          started_at: now,
          is_completed: false,
          completed_at: null,
        },
        { onConflict: 'student_id,entry_id' }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // action === 'complete'
  const { data, error } = await (supabase as any)
    .from('nexus_student_entry_progress')
    .upsert(
      {
        student_id: studentId,
        entry_id: entryId,
        status: 'completed',
        is_completed: true,
        completed_at: now,
      },
      { onConflict: 'student_id,entry_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateModuleItemStatus(
  studentId: string,
  moduleItemId: string,
  action: 'start' | 'complete',
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const now = new Date().toISOString();

  if (action === 'start') {
    const { data, error } = await (supabase as any)
      .from('nexus_student_module_item_progress')
      .upsert(
        {
          student_id: studentId,
          module_item_id: moduleItemId,
          status: 'in_progress',
          started_at: now,
          is_completed: false,
          completed_at: null,
        },
        { onConflict: 'student_id,module_item_id' }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // action === 'complete'
  const { data, error } = await (supabase as any)
    .from('nexus_student_module_item_progress')
    .upsert(
      {
        student_id: studentId,
        module_item_id: moduleItemId,
        status: 'completed',
        is_completed: true,
        completed_at: now,
      },
      { onConflict: 'student_id,module_item_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ============================================
// ENTRY RESOURCES
// ============================================

export async function addEntryResource(
  data: { entry_id: string; resource_type: string; url: string },
  client?: TypedSupabaseClient
): Promise<NexusChecklistEntryResource> {
  const supabase = client || getSupabaseAdminClient();
  const { data: resource, error } = await (supabase as any)
    .from('nexus_checklist_entry_resources')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return resource as NexusChecklistEntryResource;
}

export async function removeEntryResource(
  resourceId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await (supabase as any)
    .from('nexus_checklist_entry_resources')
    .delete()
    .eq('id', resourceId);
  if (error) throw error;
}
