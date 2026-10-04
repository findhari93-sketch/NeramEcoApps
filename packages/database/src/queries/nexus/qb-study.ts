// @ts-nocheck: nexus_ncert_sections, nexus_qb_tag_ncert and nexus_qb_question_study
// are not yet in the generated Supabase types. Regenerate with
// pnpm supabase:gen:types after 20261025090100 is applied.
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import { QB_CATEGORY_LABELS } from '../../types';
import type {
  NexusNcertSection,
  NexusQBQuestionStudy,
  QBFoundationRef,
  QBNcertRef,
  QBQuestionStudyView,
  QBStudyChapter,
  QBStudyConcept,
  QBStudyConceptInput,
} from '../../types';

/**
 * "What to study" for a question bank question: the chapter it is really about,
 * the chapters it leans on, and the NCERT or Foundation sections that teach
 * each concept. The founder asked for this after filtering Trigonometry in
 * class and finding Functions questions there.
 */

/** Below this an AI row waits for a teacher before students see it. */
export const QB_STUDY_AUTO_CONFIDENCE = 0.85;

/** Broad subjects. A question's chapter is never one of these. */
const BROAD = new Set(['mathematics', 'aptitude', 'drawing']);

export function ncertPdfUrl(pdfFile: string): string {
  return `https://ncert.nic.in/textbook/pdf/${pdfFile}.pdf`;
}

/** Students see a row a teacher wrote or approved, or one the model was sure of. */
export function qbStudyIsVisible(
  row: Pick<NexusQBQuestionStudy, 'source' | 'reviewed_at' | 'confidence'> | null | undefined,
): boolean {
  if (!row) return false;
  if (row.source === 'staff' || row.reviewed_at) return true;
  return (row.confidence ?? 0) >= QB_STUDY_AUTO_CONFIDENCE;
}

/**
 * The rule for one question. Besides qbStudyIsVisible, an AI row whose primary
 * chapter is the chapter the question already carries is shown: the existing
 * tag and the model agree, and no proposal exists for a teacher to review.
 */
export function qbStudyIsVisibleFor(
  row: Pick<NexusQBQuestionStudy, 'source' | 'reviewed_at' | 'confidence' | 'primary_slug'> | null | undefined,
  categories: string[] | null | undefined,
): boolean {
  if (!row) return false;
  if (qbStudyIsVisible(row)) return true;
  return !!row.primary_slug && (categories || []).includes(row.primary_slug);
}

export interface QBStudyCatalog {
  ncert: Map<string, NexusNcertSection>;
  /** chapter tag slug -> its default NCERT readings, in order */
  tagNcert: Map<string, { ref: string; beyond_ncert: boolean }[]>;
  /** subject tag slug -> label */
  tagLabels: Map<string, string>;
}

function toNcertRef(row: NexusNcertSection | undefined, beyond = false): QBNcertRef | null {
  if (!row || !row.is_active) return null;
  return {
    ref: row.ref,
    class_level: row.class_level,
    chapter_no: row.chapter_no,
    chapter_title: row.chapter_title,
    section_no: row.section_no,
    section_title: row.section_title,
    url: ncertPdfUrl(row.pdf_file),
    ...(beyond ? { beyond_ncert: true } : {}),
  };
}

function chapterOf(slug: string, catalog: QBStudyCatalog): QBStudyChapter {
  const ncert = (catalog.tagNcert.get(slug) || [])
    .map((m) => toNcertRef(catalog.ncert.get(m.ref), m.beyond_ncert))
    .filter((r): r is QBNcertRef => r !== null);
  const label =
    catalog.tagLabels.get(slug) ?? (QB_CATEGORY_LABELS as Record<string, string>)[slug] ?? slug.replace(/_/g, ' ');
  return { slug, label, ncert };
}

/** A chapter tag's label and NCERT readings, for callers that start from a chapter slug (the assistant's what_to_study). */
export const studyChapterFor = chapterOf;

/**
 * Pure: turn a stored row (or nothing) into what the student sees.
 *
 * With no visible row the question still gets its chapter's NCERT reading from
 * categories[], so the panel is useful before the classifier has run. Returns
 * null when there is nothing worth showing (e.g. an aptitude question with no
 * Foundation link yet).
 */
export function buildQBStudyView(
  row: NexusQBQuestionStudy | null,
  categories: string[] | null | undefined,
  catalog: QBStudyCatalog,
  foundation: Map<string, QBFoundationRef> = new Map(),
  opts: { staffPreview?: boolean } = {},
): QBQuestionStudyView | null {
  if (row && (opts.staffPreview || qbStudyIsVisibleFor(row, categories))) {
    const concepts: QBStudyConcept[] = (Array.isArray(row.concepts) ? row.concepts : [])
      .filter((c: QBStudyConceptInput) => c && typeof c.name === 'string' && c.name.trim())
      .map((c: QBStudyConceptInput) => ({
        name: c.name.trim(),
        why: c.why?.trim() || null,
        // An unknown ref is dropped, never shown as a broken link.
        ncert: c.ncert_ref ? toNcertRef(catalog.ncert.get(c.ncert_ref)) : null,
        foundation: c.foundation_section_id ? foundation.get(c.foundation_section_id) ?? null : null,
      }));
    const primary = row.primary_slug ? chapterOf(row.primary_slug, catalog) : null;
    const alsoUses = (row.also_uses || [])
      .filter((s) => s && s !== row.primary_slug && !BROAD.has(s))
      .map((s) => chapterOf(s, catalog));
    if (!primary && alsoUses.length === 0 && concepts.length === 0) return null;
    return { primary, also_uses: alsoUses, concepts, source: row.source };
  }

  // Fallback: the first chapter in categories[] that has an NCERT reading.
  const chapterSlug = (categories || []).find((c) => !BROAD.has(c) && catalog.tagNcert.has(c));
  if (!chapterSlug) return null;
  return { primary: chapterOf(chapterSlug, catalog), also_uses: [], concepts: [], source: 'chapter' };
}

// ── Reads ────────────────────────────────────────────────────────────────────

// The catalog is ~135 NCERT rows plus ~50 mappings and changes with a new
// textbook edition, so it is cached rather than read on every question open.
const CATALOG_TTL_MS = 10 * 60 * 1000;
let catalogCache: { at: number; catalog: QBStudyCatalog } | null = null;

/** Test seam. */
export function clearQBStudyCatalogCache(): void {
  catalogCache = null;
}

export async function getQBStudyCatalog(client?: TypedSupabaseClient): Promise<QBStudyCatalog> {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.catalog;
  const supabase = client || getSupabaseAdminClient();
  const [ncertRes, mapRes, tagRes] = await Promise.all([
    supabase.from('nexus_ncert_sections').select('*').order('sort_order', { ascending: true }),
    supabase.from('nexus_qb_tag_ncert').select('tag_slug, ncert_ref, beyond_ncert, sort_order').order('sort_order'),
    supabase.from('nexus_qb_tags').select('slug, label').eq('group_type', 'subject').eq('is_active', true),
  ]);
  if (ncertRes.error) throw ncertRes.error;
  if (mapRes.error) throw mapRes.error;
  if (tagRes.error) throw tagRes.error;

  const ncert = new Map<string, NexusNcertSection>();
  for (const r of ncertRes.data || []) ncert.set(r.ref, r as NexusNcertSection);
  const tagNcert = new Map<string, { ref: string; beyond_ncert: boolean }[]>();
  for (const r of mapRes.data || []) {
    const list = tagNcert.get(r.tag_slug) || [];
    list.push({ ref: r.ncert_ref, beyond_ncert: !!r.beyond_ncert });
    tagNcert.set(r.tag_slug, list);
  }
  const tagLabels = new Map<string, string>();
  for (const r of tagRes.data || []) tagLabels.set(r.slug, r.label);

  const catalog = { ncert, tagNcert, tagLabels };
  catalogCache = { at: Date.now(), catalog };
  return catalog;
}

/** Foundation sections by id, with their chapter, for the ids a concept list names. */
export async function getFoundationRefs(
  sectionIds: string[],
  client?: TypedSupabaseClient,
): Promise<Map<string, QBFoundationRef>> {
  const out = new Map<string, QBFoundationRef>();
  const ids = [...new Set(sectionIds.filter(Boolean))];
  if (ids.length === 0) return out;
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_foundation_sections')
    .select('id, title, chapter:nexus_foundation_chapters!inner(id, title, chapter_number, is_published)')
    .in('id', ids);
  if (error) throw error;
  for (const s of data || []) {
    const ch = Array.isArray(s.chapter) ? s.chapter[0] : s.chapter;
    if (!ch || ch.is_published === false) continue;
    out.set(s.id, {
      chapter_id: ch.id,
      chapter_number: ch.chapter_number,
      chapter_title: ch.title,
      section_id: s.id,
      section_title: s.title,
    });
  }
  return out;
}

/** The stored row, whatever its visibility (staff screens need the unreviewed ones). */
export async function getQBQuestionStudyRow(
  questionId: string,
  client?: TypedSupabaseClient,
): Promise<NexusQBQuestionStudy | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_qb_question_study')
    .select('*')
    .eq('question_id', questionId)
    .maybeSingle();
  if (error) throw error;
  return (data as NexusQBQuestionStudy) || null;
}

/** Everything the "What to study" panel needs for one question, or null. */
export async function getQBQuestionStudyView(
  questionId: string,
  categories: string[] | null | undefined,
  client?: TypedSupabaseClient,
): Promise<QBQuestionStudyView | null> {
  const [row, catalog] = await Promise.all([getQBQuestionStudyRow(questionId, client), getQBStudyCatalog(client)]);
  const visible = qbStudyIsVisibleFor(row, categories) ? row : null;
  const foundation = visible
    ? await getFoundationRefs(
        (visible.concepts || []).map((c) => c?.foundation_section_id).filter(Boolean) as string[],
        client,
      )
    : new Map<string, QBFoundationRef>();
  return buildQBStudyView(visible, categories, catalog, foundation);
}

/**
 * A teacher's edit. Writes source 'staff' and marks it reviewed, and keeps
 * categories[] in step: the primary chapter replaces whatever chapter was there
 * (broad subjects are kept), through the same RPC the reclassify queue uses so
 * the tag join table follows.
 */
export async function saveQBQuestionStudy(
  questionId: string,
  input: { primary_slug: string | null; also_uses: string[]; concepts: QBStudyConceptInput[] },
  staffId: string,
  client?: TypedSupabaseClient,
): Promise<NexusQBQuestionStudy> {
  const supabase = client || getSupabaseAdminClient();
  const now = new Date().toISOString();
  const concepts = (input.concepts || [])
    .filter((c) => c && c.name && c.name.trim())
    .slice(0, 6)
    .map((c) => ({
      name: c.name.trim(),
      ...(c.why?.trim() ? { why: c.why.trim() } : {}),
      ...(c.ncert_ref ? { ncert_ref: c.ncert_ref } : {}),
      ...(c.foundation_section_id ? { foundation_section_id: c.foundation_section_id } : {}),
    }));
  const alsoUses = [...new Set((input.also_uses || []).filter((s) => s && s !== input.primary_slug))].slice(0, 3);

  const { data, error } = await supabase
    .from('nexus_qb_question_study')
    .upsert(
      {
        question_id: questionId,
        primary_slug: input.primary_slug,
        also_uses: alsoUses,
        concepts,
        source: 'staff',
        reviewed_by: staffId,
        reviewed_at: now,
        updated_at: now,
      },
      { onConflict: 'question_id' },
    )
    .select('*')
    .single();
  if (error) throw error;

  if (input.primary_slug) {
    await setQBPrimaryChapter(questionId, input.primary_slug, 'manual', staffId, null, client);
  }
  return data as NexusQBQuestionStudy;
}

/**
 * Make `primarySlug` the question's only chapter in categories[] (and the tag
 * table). Done as a category proposal applied at once, so there is one write
 * path and an audit row for every change.
 *
 * Returns the proposal id, or null when nothing needed to change.
 */
export async function setQBPrimaryChapter(
  questionId: string,
  primarySlug: string,
  source: 'ai' | 'manual',
  reviewerId: string | null,
  meta: { run_id?: string; confidence?: number | null; rationale?: string | null; apply?: boolean } | null,
  client?: TypedSupabaseClient,
): Promise<string | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data: q, error } = await supabase
    .from('nexus_qb_questions')
    .select('categories')
    .eq('id', questionId)
    .single();
  if (error) throw error;
  const current: string[] = q?.categories || [];
  const remove = current.filter((c) => !BROAD.has(c) && c !== primarySlug);
  const add = current.includes(primarySlug) ? [] : [primarySlug];
  if (add.length === 0 && remove.length === 0) return null;

  const { data: proposal, error: pErr } = await supabase
    .from('nexus_qb_category_proposals')
    .insert({
      run_id: meta?.run_id ?? crypto.randomUUID(),
      question_id: questionId,
      current_categories: current,
      proposed_add: add,
      proposed_remove: remove,
      source,
      confidence: meta?.confidence ?? null,
      rationale: meta?.rationale ?? null,
    })
    .select('id')
    .single();
  if (pErr) throw pErr;

  if (meta?.apply !== false) {
    const { error: aErr } = await supabase.rpc('nexus_qb_apply_category_proposals', {
      p_ids: [proposal.id],
      p_reviewer: reviewerId,
    });
    if (aErr) throw aErr;
  }
  return proposal.id;
}

/**
 * A teacher approved the chapter change for these questions, so their AI
 * "What to study" rows go live too. Staff-written rows are left alone.
 */
export async function markQBStudyReviewedForProposals(
  proposalIds: string[],
  reviewerId: string,
  client?: TypedSupabaseClient,
): Promise<number> {
  if (proposalIds.length === 0) return 0;
  const supabase = client || getSupabaseAdminClient();
  const { data: props, error } = await supabase
    .from('nexus_qb_category_proposals')
    .select('question_id, proposed_add')
    .in('id', proposalIds);
  if (error) throw error;
  let marked = 0;
  for (const p of props || []) {
    // Only when the approved chapter is the one the study row names.
    const { data, error: uErr } = await supabase
      .from('nexus_qb_question_study')
      .update({ reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
      .eq('question_id', p.question_id)
      .eq('source', 'ai')
      .in('primary_slug', p.proposed_add || [])
      .select('question_id');
    if (uErr) throw uErr;
    marked += (data || []).length;
  }
  return marked;
}

/** Staff view of the stored rows for a set of questions, visible or not. */
export async function getQBStudyPreviews(
  questions: { id: string; categories: string[] | null }[],
  client?: TypedSupabaseClient,
): Promise<Map<string, QBQuestionStudyView>> {
  const out = new Map<string, QBQuestionStudyView>();
  if (questions.length === 0) return out;
  const supabase = client || getSupabaseAdminClient();
  const [{ data: rows, error }, catalog] = await Promise.all([
    supabase.from('nexus_qb_question_study').select('*').in('question_id', questions.map((q) => q.id)),
    getQBStudyCatalog(client),
  ]);
  if (error) throw error;
  const byId = new Map((rows || []).map((r: NexusQBQuestionStudy) => [r.question_id, r]));
  const foundation = await getFoundationRefs(
    (rows || []).flatMap((r: NexusQBQuestionStudy) => (r.concepts || []).map((c) => c?.foundation_section_id)).filter(Boolean) as string[],
    client,
  );
  for (const q of questions) {
    const row = byId.get(q.id);
    if (!row) continue;
    const view = buildQBStudyView(row, q.categories, catalog, foundation, { staffPreview: true });
    if (view) out.set(q.id, view);
  }
  return out;
}

// ── Staff editor ─────────────────────────────────────────────────────────────

const MATH_CHAPTER_ROOTS = ['algebra', 'coordinate_geometry', 'calculus', 'trigonometry', 'vectors_and_3d_geometry', 'probability_and_statistics'];

export interface QBStudyEditorData {
  row: NexusQBQuestionStudy | null;
  categories: string[];
  /** Maths chapters a primary or "also uses" can be, grouped by their parent. */
  chapters: { slug: string; label: string; group: string }[];
  ncert: { ref: string; label: string }[];
  foundation: { id: string; label: string }[];
}

/** Everything the "What to study" editor needs for one question, in one read. */
export async function getQBStudyEditorData(
  questionId: string,
  client?: TypedSupabaseClient,
): Promise<QBStudyEditorData> {
  const supabase = client || getSupabaseAdminClient();
  const [row, catalog, qRes, tagRes, fRes] = await Promise.all([
    getQBQuestionStudyRow(questionId, client),
    getQBStudyCatalog(client),
    supabase.from('nexus_qb_questions').select('categories').eq('id', questionId).single(),
    supabase.from('nexus_qb_tags').select('id, slug, label, parent_id, sort_order').eq('group_type', 'subject').eq('is_active', true),
    supabase
      .from('nexus_foundation_sections')
      .select('id, title, sort_order, chapter:nexus_foundation_chapters!inner(title, chapter_number, is_published)'),
  ]);
  if (qRes.error) throw qRes.error;
  if (tagRes.error) throw tagRes.error;
  if (fRes.error) throw fRes.error;

  const tags = tagRes.data || [];
  const byId = new Map(tags.map((t) => [t.id, t]));
  const chapters = tags
    .filter((t) => t.parent_id && MATH_CHAPTER_ROOTS.includes(byId.get(t.parent_id)?.slug))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((t) => ({ slug: t.slug, label: t.label, group: byId.get(t.parent_id)!.label }));

  const ncert = [...catalog.ncert.values()]
    .filter((n) => n.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((n) => {
      const r = toNcertRef(n)!;
      return { ref: r.ref, label: `Class ${r.class_level} · Ch ${r.chapter_no} ${r.chapter_title}${r.section_no ? `, ${r.section_no} ${r.section_title}` : ''}` };
    });

  const foundation = (fRes.data || [])
    .map((s: any) => ({ ...s, chapter: Array.isArray(s.chapter) ? s.chapter[0] : s.chapter }))
    .filter((s: any) => s.chapter?.is_published)
    .sort((a: any, b: any) => a.chapter.chapter_number - b.chapter.chapter_number || a.sort_order - b.sort_order)
    .map((s: any) => ({ id: s.id, label: `Foundation Ch ${s.chapter.chapter_number} ${s.chapter.title} · ${s.title}` }));

  return { row, categories: qRes.data?.categories || [], chapters, ncert, foundation };
}
