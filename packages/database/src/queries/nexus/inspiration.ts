/**
 * Inspiration: the drawing library students search for ideas.
 *
 * Every read goes through a nexus_inspiration_* RPC, so ranking, visibility and
 * the opt-out rule live in SQL in exactly one place (nexus_inspiration_base).
 * Callers are API routes on the admin client: Nexus signs in with Microsoft, so
 * RLS cannot see the caller and there are no policies to lean on.
 *
 * Spec: docs/superpowers/specs/2026-09-15-drawing-inspiration-design.md
 */
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';

export type InspirationSourceKind = 'submission_reference' | 'submission_original' | 'exemplar' | 'qb_solution';
export type InspirationCuration = 'auto' | 'shown' | 'hidden';
export type InspirationBy = 'reference' | 'current' | 'alumni';
export type InspirationSort = 'relevant' | 'newest' | 'saved';
export type InspirationScope = 'visible' | 'hidden' | 'all';
export type InspirationExam = 'NATA' | 'JEE_PAPER_2';
export type InspirationMatchKind = 'browse' | 'text' | 'any' | 'fuzzy' | 'similar' | 'item' | 'pair';

export interface InspirationRow {
  id: string;
  source_kind: InspirationSourceKind;
  source_submission_id: string | null;
  source_drawing_question_id: string | null;
  image_url: string;
  thumbnail_url: string | null;
  image_aspect: number | null;
  title_override: string | null;
  brief: string | null;
  category: string | null;
  type_slugs: string[];
  tag_labels: string[];
  exam_types: string[];
  paper_years: number[];
  is_featured: boolean;
  /** Already adjusted for the author's opt-out. */
  is_visible: boolean;
  curation: InspirationCuration;
  auto_eligible: boolean;
  /** Tutor score as a fraction. Staff only: never send it to a student. */
  score_pct: number | null;
  save_count: number;
  source_created_at: string;
  /** Null when the author opted out. */
  author_id: string | null;
  author_name: string | null;
  author_first_name: string | null;
  author_last_name: string | null;
  author_is_alumni: boolean;
  author_academic_year: string | null;
  author_opted_out: boolean;
  is_saved: boolean;
  rank: number;
  match_kind: InspirationMatchKind;
  total_count: number;
}

export interface InspirationFilters {
  query?: string;
  types?: string[];
  exam?: InspirationExam;
  by?: InspirationBy;
  year?: number;
  sort?: InspirationSort;
  scope?: InspirationScope;
  savedOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface InspirationSearchResult {
  rows: InspirationRow[];
  total: number;
  matchKind: InspirationMatchKind | null;
}

export interface InspirationFacet {
  facet: 'type' | 'exam' | 'by' | 'year';
  value: string;
  label: string | null;
  item_count: number;
}

export interface InspirationItemPatch {
  curation?: InspirationCuration;
  is_featured?: boolean;
  title_override?: string | null;
  brief_override?: string | null;
  /** Exemplars only: a student drawing's types come from its review. */
  type_slugs?: string[];
  exam_types?: string[];
  paper_years?: number[];
}

export interface ExemplarInput {
  image_url: string;
  title: string | null;
  brief: string | null;
  type_slugs: string[];
  exam_types: string[];
  paper_years: number[];
}

export interface ItemImageWork {
  id: string;
  image_url: string;
  thumbnail_url: string | null;
  image_aspect: number | null;
}

const MAX_PAGE = 60;

// The generated Database type predates these tables and functions.
function db(client?: TypedSupabaseClient): any {
  return client || getSupabaseAdminClient();
}

export function toSearchArgs(filters: InspirationFilters, viewerId: string) {
  return {
    p_query: filters.query?.trim() || null,
    p_types: filters.types && filters.types.length > 0 ? filters.types : null,
    p_exam: filters.exam ?? null,
    p_by: filters.by ?? null,
    p_year: filters.year ?? null,
    p_sort: filters.sort ?? 'relevant',
    p_scope: filters.scope ?? 'visible',
    p_viewer_id: viewerId,
    p_saved_only: filters.savedOnly ?? false,
    p_limit: Math.min(Math.max(filters.limit ?? 30, 1), MAX_PAGE),
    p_offset: Math.max(filters.offset ?? 0, 0),
  };
}

export async function searchInspiration(
  filters: InspirationFilters,
  viewerId: string,
  client?: TypedSupabaseClient,
): Promise<InspirationSearchResult> {
  const { data, error } = await db(client).rpc('nexus_inspiration_search', toSearchArgs(filters, viewerId));
  if (error) throw error;
  const rows = (data || []) as InspirationRow[];
  return {
    rows,
    // The RPC repeats the windowed total on every row, so an empty page means zero.
    total: rows.length ? Number(rows[0].total_count) : 0,
    matchKind: rows.length ? rows[0].match_kind : null,
  };
}

export async function getInspirationFacets(
  filters: InspirationFilters,
  viewerId: string,
  client?: TypedSupabaseClient,
): Promise<InspirationFacet[]> {
  const a = toSearchArgs(filters, viewerId);
  const { data, error } = await db(client).rpc('nexus_inspiration_facets', {
    p_query: a.p_query,
    p_types: a.p_types,
    p_exam: a.p_exam,
    p_by: a.p_by,
    p_year: a.p_year,
    p_scope: a.p_scope,
    p_viewer_id: viewerId,
  });
  if (error) throw error;
  return ((data || []) as InspirationFacet[]).map((f) => ({ ...f, item_count: Number(f.item_count) }));
}

export async function getInspirationItem(
  itemId: string,
  viewerId: string,
  scope: InspirationScope,
  client?: TypedSupabaseClient,
): Promise<{ item: InspirationRow | null; pair: InspirationRow | null }> {
  const { data, error } = await db(client).rpc('nexus_inspiration_get', {
    p_item_id: itemId,
    p_viewer_id: viewerId,
    p_scope: scope,
  });
  if (error) throw error;
  const rows = (data || []) as InspirationRow[];
  return {
    item: rows.find((r) => r.match_kind === 'item') ?? null,
    pair: rows.find((r) => r.match_kind === 'pair') ?? null,
  };
}

export async function getSimilarInspiration(
  itemId: string,
  viewerId: string,
  limit = 12,
  client?: TypedSupabaseClient,
): Promise<InspirationRow[]> {
  const { data, error } = await db(client).rpc('nexus_inspiration_similar', {
    p_item_id: itemId,
    p_viewer_id: viewerId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data || []) as InspirationRow[];
}

export async function setInspirationSave(
  itemId: string,
  userId: string,
  saved: boolean,
  client?: TypedSupabaseClient,
): Promise<void> {
  const table = db(client).from('nexus_inspiration_saves');
  const { error } = saved
    ? await table.upsert({ user_id: userId, item_id: itemId }, { onConflict: 'user_id,item_id', ignoreDuplicates: true })
    : await table.delete().eq('user_id', userId).eq('item_id', itemId);
  if (error) throw error;
}

export async function updateInspirationItem(
  itemId: string,
  patch: InspirationItemPatch,
  actorId: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const row: Record<string, unknown> = { ...patch };
  if (patch.curation !== undefined) {
    row.curated_by = actorId;
    row.curated_at = new Date().toISOString();
  }
  const { error } = await db(client).from('nexus_inspiration_items').update(row).eq('id', itemId);
  if (error) throw error;
}

/**
 * Turns a student's drawing sharing off (or back on). This is the opt-out
 * itself, read by nexus_inspiration_base: their originals leave the student
 * shelf and the references made from their work stay, credited "Neram
 * reference". Only a student's row is changed; resolves false when the user is
 * not a student (or does not exist), so the caller can refuse.
 */
export async function setDrawingSharingOptOut(
  userId: string,
  optOut: boolean,
  client?: TypedSupabaseClient,
): Promise<boolean> {
  const { data, error } = await db(client)
    .from('users')
    .update({ share_drawings_opt_out: optOut })
    .eq('id', userId)
    .eq('user_type', 'student')
    .select('id');
  if (error) throw error;
  return (data || []).length > 0;
}

/**
 * Reads the same opt-out, for a caller about to widen a drawing's audience.
 *
 * `nexus_inspiration_base` already hides an opted-out student's originals from
 * every read, so this is not the enforcement. It is here so the feature route
 * can tell the teacher plainly that the work stays in Teams and off the shelf,
 * instead of quietly writing a row that nobody will ever be shown.
 */
export async function getDrawingSharingOptOut(
  userId: string,
  client?: TypedSupabaseClient,
): Promise<boolean> {
  const { data, error } = await db(client)
    .from('users')
    .select('share_drawings_opt_out')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return !!data?.share_drawings_opt_out;
}

/**
 * The shelf item a submission already has, if it has one.
 *
 * Read before anything is posted, because the link in the Teams card has to
 * point somewhere a STUDENT can open. It used to point at
 * /teacher/sketchbook/..., posted into a group chat that is forty two students
 * and six staff, so the people it was shown to were the people it locked out.
 */
export async function getSubmissionInspirationItemId(
  submissionId: string,
  client?: TypedSupabaseClient,
): Promise<string | null> {
  const { data, error } = await db(client)
    .from('nexus_inspiration_items')
    .select('id')
    .eq('source_submission_id', submissionId)
    .eq('source_kind', 'submission_original')
    .maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

/**
 * Puts a featured drawing on the shelf every student browses.
 *
 * Featuring used to end at Teams, so the one drawing a teacher singled out was
 * the one drawing nobody could go back and look at. The row it needs already
 * exists: the sync trigger writes a `submission_original` item for every
 * submission, and a sketch's sits at `curation='auto'` with
 * `auto_eligible=false` because a sketchbook page is never scored. `is_visible`
 * is generated as `curation='shown' OR (curation='auto' AND auto_eligible)`, so
 * flipping `curation` alone reveals it. No new table, no second copy of the
 * image, and the credit and the alumni badge come free from the RPC.
 *
 * Scoped to `submission_original` on purpose: the teacher's corrected overlay of
 * the same submission is a different item and is not what was praised.
 *
 * Idempotent, so featuring twice is one update that changes nothing, and
 * resolves null when no item row exists (an exam drawing, which the sync
 * deletes) so the caller can carry on rather than fail a feature that posted.
 */
export async function showFeaturedSubmission(
  submissionId: string,
  curatorId: string,
  fallbackTitle?: string,
  client?: TypedSupabaseClient,
): Promise<ItemImageWork | null> {
  const { data, error } = await db(client)
    .from('nexus_inspiration_items')
    .update({
      curation: 'shown',
      is_featured: true,
      curated_by: curatorId,
      curated_at: new Date().toISOString(),
    })
    .eq('source_submission_id', submissionId)
    .eq('source_kind', 'submission_original')
    .select('id, image_url, thumbnail_url, image_aspect')
    .maybeSingle();
  if (error) throw error;
  const item = (data as ItemImageWork | null) ?? null;

  // A sketch reaches the shelf with no question and no tags, so displayTitle
  // falls all the way through to the word "Drawing" and the search vector has
  // nothing in its highest-weighted field. One title fixes both. Only when the
  // column is still null, so a title a teacher typed is never overwritten, and
  // so featuring the same drawing twice does not undo their wording.
  if (item && fallbackTitle) {
    const { error: titleError } = await db(client)
      .from('nexus_inspiration_items')
      .update({ title_override: fallbackTitle })
      .eq('id', item.id)
      .is('title_override', null);
    if (titleError) throw titleError;
  }
  return item;
}

/**
 * The exact undo of showFeaturedSubmission, for un-featuring.
 *
 * Back to `auto`, never to `hidden`. A sketch has `auto_eligible=false` so
 * `auto` means invisible again, while an assignment drawing rated four stars or
 * more returns to being shown by the automatic rule that earned it its place
 * before anyone featured it. `hidden` would suppress that drawing for good,
 * which is a punishment nobody asked for.
 */
export async function hideFeaturedSubmission(
  submissionId: string,
  curatorId: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const { error } = await db(client)
    .from('nexus_inspiration_items')
    .update({
      curation: 'auto',
      is_featured: false,
      curated_by: curatorId,
      curated_at: new Date().toISOString(),
    })
    .eq('source_submission_id', submissionId)
    .eq('source_kind', 'submission_original');
  if (error) throw error;
}

export async function createExemplar(
  input: ExemplarInput,
  actorId: string,
  client?: TypedSupabaseClient,
): Promise<string> {
  const { data, error } = await db(client)
    .from('nexus_inspiration_items')
    .insert({
      source_kind: 'exemplar',
      image_url: input.image_url,
      title_override: input.title,
      brief: input.brief,
      type_slugs: input.type_slugs,
      exam_types: input.exam_types,
      paper_years: input.paper_years,
      // A teacher chose it, so it is on the shelf from the start.
      auto_eligible: true,
      created_by: actorId,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteExemplar(itemId: string, client?: TypedSupabaseClient): Promise<boolean> {
  const { data, error } = await db(client)
    .from('nexus_inspiration_items')
    .delete()
    .eq('id', itemId)
    .eq('source_kind', 'exemplar')
    .select('id');
  if (error) throw error;
  return (data || []).length > 0;
}

/** Visible items still missing a thumbnail or a shape, newest first. */
export async function listItemsNeedingImages(
  limit: number,
  client?: TypedSupabaseClient,
): Promise<{ items: ItemImageWork[]; remaining: number }> {
  const { data, error, count } = await db(client)
    .from('nexus_inspiration_items')
    .select('id, image_url, thumbnail_url, image_aspect', { count: 'exact' })
    .eq('is_visible', true)
    .or('thumbnail_url.is.null,image_aspect.is.null')
    .order('source_created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return { items: (data || []) as ItemImageWork[], remaining: count ?? 0 };
}

export async function setItemImageMeta(
  itemId: string,
  meta: { thumbnail_url?: string; image_aspect?: number },
  client?: TypedSupabaseClient,
): Promise<void> {
  const { error } = await db(client).from('nexus_inspiration_items').update(meta).eq('id', itemId);
  if (error) throw error;
}

export interface SubmissionInspirationState {
  item_id: string;
  curation: 'auto' | 'shown' | 'hidden';
  visible: boolean;
  auto_eligible: boolean;
}

/** The Inspiration items made from one submission, for the review screen's switch. */
export async function getInspirationItemsForSubmission(
  submissionId: string,
  client?: TypedSupabaseClient,
): Promise<{ original: SubmissionInspirationState | null; reference: SubmissionInspirationState | null }> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from('nexus_inspiration_items')
    .select('id, source_kind, curation, is_visible, auto_eligible')
    .eq('source_submission_id', submissionId);
  if (error) throw error;
  const out: { original: SubmissionInspirationState | null; reference: SubmissionInspirationState | null } = { original: null, reference: null };
  for (const row of (data ?? []) as Array<{ id: string; source_kind: string; curation: SubmissionInspirationState['curation']; is_visible: boolean; auto_eligible: boolean }>) {
    const state = { item_id: row.id, curation: row.curation, visible: !!row.is_visible, auto_eligible: !!row.auto_eligible };
    if (row.source_kind === 'submission_original') out.original = state;
    if (row.source_kind === 'submission_reference') out.reference = state;
  }
  return out;
}

export interface InspirationAttemptRow {
  submission_id: string | null;
  original_item_id: string | null;
  image_url: string;
  thumbnail_url: string | null;
  author_first_name: string | null;
  author_last_name: string | null;
  author_name: string | null;
  author_is_alumni: boolean;
  author_academic_year: string | null;
  submitted_at: string;
  status: string | null;
  tutor_rating: number | null;
  tutor_marks: number | null;
  reviewed_at: string | null;
  practised_from: boolean;
}

/** "Drawn from this". Who sees what is decided in nexus_inspiration_attempts, not here. */
export async function listInspirationAttempts(
  itemId: string,
  viewerId: string,
  staff: boolean,
  limit = 24,
  client?: TypedSupabaseClient,
): Promise<{ students: number; shown: number; rows: InspirationAttemptRow[] }> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await (supabase as any).rpc('nexus_inspiration_attempts', {
    p_item_id: itemId,
    p_viewer_id: viewerId,
    p_staff: staff,
    p_limit: limit,
  });
  if (error) throw error;
  if (!data) return { students: 0, shown: 0, rows: [] };
  const body = data as { students: number | string; shown: number | string; rows: InspirationAttemptRow[] | null };
  return { students: Number(body.students) || 0, shown: Number(body.shown) || 0, rows: body.rows ?? [] };
}

