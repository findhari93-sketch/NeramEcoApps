/**
 * My Learning reads and edits for the student's own items. The content of an
 * item is written only by the tutor (save.ts); a student may change the note
 * and the star, or delete it.
 */
import type { LearningItem, LearningItemKind, MasteryState } from './types';

const ITEMS = 'nexus_learning_items';
const KINDS: ReadonlySet<string> = new Set(['formula', 'concept', 'explanation', 'mistake', 'shortcut', 'example', 'diagram', 'bookmark']);
const COLS = 'id, kind, title, body_md, source_question_id, note, important, created_at, concept_ids';

type Row = Omit<LearningItem, 'concepts'> & { concept_ids: string[] | null };

function throwIf(error: unknown): void {
  if (error) throw Object.assign(new Error('Learning items read failed'), { cause: error });
}

async function withConcepts(supabase: any, studentId: string, rows: Row[]): Promise<LearningItem[]> {
  const ids = [...new Set(rows.flatMap((r) => r.concept_ids || []))];
  const concepts = new Map<string, { slug: string; label: string }>();
  const states = new Map<string, MasteryState>();
  if (ids.length) {
    const [{ data: cs, error: cErr }, { data: ms, error: mErr }] = await Promise.all([
      supabase.from('nexus_concepts').select('id, slug, label').in('id', ids),
      supabase.from('nexus_student_concept_mastery').select('concept_id, state').eq('student_id', studentId).in('concept_id', ids),
    ]);
    throwIf(cErr);
    throwIf(mErr);
    for (const c of (cs || []) as Array<{ id: string; slug: string; label: string }>) concepts.set(c.id, c);
    for (const m of (ms || []) as Array<{ concept_id: string; state: MasteryState }>) states.set(m.concept_id, m.state);
  }
  return rows.map(({ concept_ids, ...r }) => ({
    ...r,
    concepts: (concept_ids || []).filter((id) => concepts.has(id)).map((id) => ({ ...concepts.get(id)!, state: states.get(id) ?? 'UNKNOWN' })),
  }));
}

/** `filter` is a kind, 'important', or null for everything. Newest first, at most 200. */
export async function listLearningItems(supabase: any, studentId: string, filter: string | null): Promise<LearningItem[]> {
  let q = supabase.from(ITEMS).select(COLS).eq('student_id', studentId);
  if (filter === 'important') q = q.eq('important', true);
  else if (filter && KINDS.has(filter)) q = q.eq('kind', filter as LearningItemKind);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(200);
  throwIf(error);
  return withConcepts(supabase, studentId, (data || []) as Row[]);
}

/** Only the owner's row; null when it is not theirs or does not exist. */
export async function updateLearningItem(
  supabase: any, studentId: string, id: string, patch: { note?: string | null; important?: boolean },
): Promise<LearningItem | null> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('note' in patch) row.note = patch.note ? String(patch.note).slice(0, 1000) : null;
  if (typeof patch.important === 'boolean') row.important = patch.important;
  const { data, error } = await supabase.from(ITEMS).update(row).eq('id', id).eq('student_id', studentId).select(COLS);
  throwIf(error);
  const hit = (data || [])[0] as Row | undefined;
  return hit ? (await withConcepts(supabase, studentId, [hit]))[0] : null;
}

export async function deleteLearningItem(supabase: any, studentId: string, id: string): Promise<boolean> {
  const { data, error } = await supabase.from(ITEMS).delete().eq('id', id).eq('student_id', studentId).select('id');
  throwIf(error);
  return (data || []).length > 0;
}
