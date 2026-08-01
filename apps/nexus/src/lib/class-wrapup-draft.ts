/**
 * Turning a transcript into a wrap-up draft.
 *
 * Extracted from api/timetable/[classId]/summarize so the nightly autodraft can
 * produce exactly what the teacher's "Generate from the class" button produces.
 * The interesting part is not the model call, it is the two things around it:
 *
 *   the registry is SHOWN to the model, so it picks tags that already exist
 *   instead of free-associating near-duplicates, and
 *
 *   what comes back is matched by slug, alias and shape rather than by exact
 *   label equality (lib/tag-resolver), which is what took the real prod registry
 *   from 6 of 26 labels resolved to 26 of 26.
 *
 * Nothing here writes. Composing the draft and saving it are separate on purpose:
 * the interactive route hands the draft to a teacher to edit, and the cron hands
 * it straight to lib/class-wrapup-write.
 */

import type { TranscriptEntry } from '@neram/database';
import { resolveSuggestedTags, type RegistryTag } from './tag-resolver';
import { generateClassSummary, type ClassImageInput, type SuggestedTag } from './class-summary-ai';

/**
 * Images sent to the model.
 *
 * Four, because a drawing class can be summarized from its board photos alone,
 * and because each one is a fetch plus base64 in the request body.
 */
export const MAX_DRAFT_IMAGES = 4;

/** A tag the model asked for that already exists in the registry. */
export interface MatchedTag {
  id: string;
  slug: string;
  label: string;
  group_type: string;
  color: string | null;
}

export interface WrapUpDraft {
  suggested_title: string;
  short_description: string;
  detailed_description: string;
  bullets: string[];
  /** Registry tags to tick on without a tap. */
  matched: MatchedTag[];
  /** Genuinely new ideas. Created only if a human taps one. */
  unmatched: SuggestedTag[];
}

/**
 * Fetch attached class images and convert them to base64 parts for the model.
 *
 * One unreachable image must not sink the request: a class with three good board
 * photos and one expired URL still summarizes fine.
 */
export async function loadClassImages(
  supabase: any,
  classId: string,
  limit: number = MAX_DRAFT_IMAGES,
): Promise<ClassImageInput[]> {
  const { data } = await supabase
    .from('nexus_class_images')
    .select('url')
    .eq('scheduled_class_id', classId)
    .order('sort_order', { ascending: true })
    .limit(limit);

  const rows = (data || []) as Array<{ url: string }>;
  const out: ClassImageInput[] = [];
  for (const row of rows) {
    try {
      const res = await fetch(row.url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const ct = res.headers.get('content-type') || 'image/jpeg';
      out.push({ base64: buf.toString('base64'), mimeType: ct.startsWith('image/') ? ct : 'image/jpeg' });
    } catch {
      // one unreachable image should not sink the whole request
    }
  }
  return out;
}

/**
 * The subject and theme vocabulary, both to prompt with and to match against.
 *
 * The exam group is excluded deliberately: it describes a paper, not a lesson.
 * `aliases` must stay in the select, its absence was one of the three defects
 * that made tag matching useless.
 */
export async function loadTagRegistry(supabase: any): Promise<RegistryTag[]> {
  const { data } = await supabase
    .from('nexus_qb_tags')
    .select('id, slug, label, group_type, color, aliases')
    .in('group_type', ['subject', 'theme'])
    .eq('is_active', true)
    .order('group_type', { ascending: true })
    .order('sort_order', { ascending: true });
  return (data || []) as RegistryTag[];
}

/**
 * Compose a draft from whatever evidence there is.
 *
 * Throws on a model failure rather than returning a half draft, because both
 * callers need to tell a rate limit apart from a real error and both already
 * classify the thrown message.
 */
export async function buildWrapUpDraft(
  supabase: any,
  input: {
    transcript: TranscriptEntry[];
    images: ClassImageInput[];
    fallbackTitle: string;
    /** Pass a preloaded registry to avoid re-reading it inside a sweep. */
    registry?: RegistryTag[];
  },
): Promise<WrapUpDraft> {
  const registry = input.registry ?? (await loadTagRegistry(supabase));

  const summary = await generateClassSummary({
    transcript: input.transcript,
    images: input.images,
    fallbackTitle: input.fallbackTitle,
    tags: registry,
  });

  const { matched, unmatched } = resolveSuggestedTags({
    registry,
    tagSlugs: summary.tag_slugs,
    newTags: summary.new_tags,
  });

  return {
    suggested_title: summary.suggested_title,
    short_description: summary.short_description,
    detailed_description: summary.detailed_description,
    bullets: summary.bullets,
    matched: matched.map((t) => ({
      id: t.id,
      slug: t.slug,
      label: t.label,
      group_type: t.group_type,
      color: t.color ?? null,
    })),
    unmatched,
  };
}
