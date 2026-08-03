/**
 * Fill a class's YouTube listing (title, description, tags, chapters) without a
 * human running the prompt by hand.
 *
 * Until now the only way to get this metadata was the copy-paste bridge: build a
 * prompt, carry it to an outside chatbot, carry the JSON back. That was the right
 * call when a teacher pressing a button was the only trigger, because one shared
 * GEMINI_API_KEY serves recaps, drawing feedback and class summaries, and burning
 * it at 4pm 429s all of them at once. A nightly sweep does not have that problem:
 * it runs at 1am against a handful of classes.
 *
 * Three things here are load bearing, and each one is a way this could quietly
 * diverge from what a teacher would have produced by hand:
 *
 *  1. The prompt comes from buildVideoMetaPrompt, unchanged. A second prompt
 *     written "for the server" would drift from the copy-paste one within a
 *     month, and the two paths would start producing different titles for
 *     identical classes.
 *  2. The composition into stored fields mirrors ClassVideoMetaPanel's
 *     applyPaste exactly, same builders, same arguments. See composeMetaPatch.
 *  3. The result goes through validateVideoMetaPatch before it is written, the
 *     same gate the PATCH route applies. The sweep must not be able to store
 *     something a teacher would have been refused.
 *
 * It reads the STORED transcript only. Running the full ladder would fire Graph
 * calls and count against this class's transcript attempt cap, so a metadata run
 * on a class the transcript sweep already gave up on would burn attempts on a
 * hunt that has provably failed. No transcript is a fine outcome: the prompt
 * already tells the model to return an empty chapters array in that case.
 */

import {
  buildVideoMetaPrompt,
  formatTranscriptForPrompt,
  parseVideoMeta,
  validateVideoMetaPatch,
  type AllowedTag,
  type ClassVideoMetaData,
} from './class-video-meta-schema';
import { generateGeminiText } from './gemini-client';
import { readStoredTranscript } from './transcript-resolver';
import {
  buildYouTubeDescription,
  buildYouTubeTitle,
  buildYouTubeTags,
} from './youtube-metadata';
import { VIDEO_META_CLASS_COLS, type VideoMetaClass } from './class-video-meta-cols';

/** A registry tag as stored, with the id the class-tag join needs. */
interface RegistryTag {
  id: string;
  slug: string;
  label: string;
  group_type: string;
  aliases?: string[] | null;
}

export type VideoMetaOutcome =
  | { status: 'generated'; warnings: string[] }
  /** Nothing was wrong; there was simply no work to do. Never counts as failure. */
  | { status: 'skipped'; reason: string }
  /** Something went wrong. The row is untouched and the manual path still works. */
  | { status: 'failed'; reason: string };

/**
 * Compose the parsed AI output into the columns nexus_class_video_meta stores.
 *
 * Deliberately identical to applyPaste in ClassVideoMetaPanel, down to which
 * arguments are NOT passed: neither passes classDate or tutorName to
 * buildYouTubeDescription, even though it accepts them. Adding them on one side
 * only would make an auto-generated description differ from a hand-pasted one
 * for the same class, which is exactly the drift this file exists to avoid.
 *
 * classDate IS passed to the title, on both sides, because a dated title is the
 * point. It is a required argument rather than an optional one so that a new
 * call site cannot quietly produce an undated title: an omission is a type
 * error, not a video on the channel with the wrong name.
 */
export function composeMetaPatch(
  d: ClassVideoMetaData,
  registry: RegistryTag[],
  classDate: string | null,
): Record<string, unknown> {
  const bySlug = new Map(registry.map((t) => [t.slug, t]));
  const chosen = d.tagSlugs.map((s) => bySlug.get(s)).filter(Boolean) as RegistryTag[];
  const topicLabels = chosen.map((t) => t.label);
  const subject = chosen.find((t) => t.group_type === 'subject')?.label || null;

  return {
    yt_title: buildYouTubeTitle({
      topic: d.topicPhrase,
      exam: d.exam,
      subject,
      language: d.language,
      classDate,
    }),
    yt_description: buildYouTubeDescription({
      hook: d.hook,
      bullets: d.bullets,
      chapters: d.chapters,
      topics: topicLabels,
      searchTerms: d.searchTerms,
      exam: d.exam,
      difficulty: d.difficulty,
      language: d.language,
    }),
    yt_tags: buildYouTubeTags({
      topics: topicLabels,
      searchTerms: d.searchTerms,
      exam: d.exam,
    }),
    chapters: d.chapters,
    search_terms: d.searchTerms,
    category: d.category,
    exam: d.exam,
    language: d.language,
    difficulty: d.difficulty,
  };
}

/**
 * Decide whether this class's listing may be overwritten.
 *
 * A teacher's edits outrank anything the model produces, and there is no undo on
 * this row. `generated_by` is the marker: the sweep writes NULL there, so a
 * non-null value means a human saved it and the row is off limits.
 */
function skipReason(meta: any): string | null {
  if (!meta) return null;
  if (meta.generated_by) return 'edited_by_teacher';
  if (meta.status === 'ready' || meta.status === 'published') return `status_${meta.status}`;
  if (meta.yt_title) return 'already_has_title';
  return null;
}

export interface GenerateVideoMetaOptions {
  /** Overwrite a row a human already touched. Only ever set by an explicit press. */
  force?: boolean;
}

/**
 * Generate and store the YouTube listing for one class.
 *
 * Never throws. Every failure path returns 'failed' with a short greppable
 * reason and leaves the row untouched, because the caller that matters is a
 * nightly sweep whose next step is uploading a 400 MB video: a missing title is
 * a fixable annoyance, and a crash that skips the upload loses a recording Teams
 * will delete in six months.
 */
export async function generateVideoMetaForClass(
  supabase: any,
  classId: string,
  options: GenerateVideoMetaOptions = {},
): Promise<VideoMetaOutcome> {
  try {
    const [clsRes, metaRes] = await Promise.all([
      supabase
        .from('nexus_scheduled_classes')
        .select(VIDEO_META_CLASS_COLS)
        .eq('id', classId)
        .maybeSingle(),
      supabase
        .from('nexus_class_video_meta')
        .select('status, yt_title, generated_by')
        .eq('scheduled_class_id', classId)
        .maybeSingle(),
    ]);

    if (clsRes?.error) return { status: 'failed', reason: `class_read: ${clsRes.error.message}` };
    const cls = clsRes?.data as VideoMetaClass | null;
    if (!cls) return { status: 'skipped', reason: 'class_not_found' };

    if (!options.force) {
      const skip = skipReason(metaRes?.data);
      if (skip) return { status: 'skipped', reason: skip };
    }

    // Same three lookups the prompt route runs, so the model sees the same
    // vocabulary and the same starting tags.
    const [registryRes, tagsRes, tutorRes] = await Promise.all([
      supabase
        .from('nexus_qb_tags')
        .select('id, slug, label, group_type, aliases')
        .in('group_type', ['subject', 'theme'])
        .eq('is_active', true)
        .order('group_type', { ascending: true })
        .order('sort_order', { ascending: true }),
      supabase
        .from('nexus_class_tags')
        .select('tag:nexus_qb_tags(slug)')
        .eq('scheduled_class_id', classId),
      cls.teacher_id
        ? supabase.from('users').select('name').eq('id', cls.teacher_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const registry = (registryRes?.data || []) as RegistryTag[];
    const currentTagSlugs = (tagsRes?.data || [])
      .map((r: any) => r.tag?.slug)
      .filter(Boolean) as string[];

    const entries = (await readStoredTranscript(supabase, classId)) || [];

    const prompt = buildVideoMetaPrompt({
      cls,
      tutorName: tutorRes?.data?.name || null,
      transcript: entries.length ? formatTranscriptForPrompt(entries) : null,
      transcriptNote: entries.length
        ? null
        : 'No transcript is stored for this class, so work from the class facts above.',
      tags: registry as AllowedTag[],
      currentTagSlugs,
    });

    let raw: string;
    try {
      raw = await generateGeminiText({
        parts: [{ text: prompt }],
        temperature: 0.4,
        maxOutputTokens: 4096,
      });
    } catch (err) {
      // A 429 here is the expected weather, not an incident: the free key is
      // shared. Say so plainly and leave the copy-paste path to pick it up.
      const message = err instanceof Error ? err.message : 'gemini_failed';
      return { status: 'failed', reason: message.includes('429') ? 'gemini_429' : message };
    }

    const result = parseVideoMeta(raw, registry as AllowedTag[]);
    if (!result.valid || !result.data) {
      console.warn(`[video-meta-ai] class ${classId} unparseable:`, result.errors.join('; '));
      return { status: 'failed', reason: 'unparseable' };
    }

    const patch = composeMetaPatch(result.data, registry, cls.scheduled_date);

    // The same gate the PATCH route applies. A model that produced a 140-character
    // title must be refused here rather than stored and rejected later by YouTube.
    const errors = validateVideoMetaPatch(patch);
    if (errors.length) {
      console.warn(`[video-meta-ai] class ${classId} failed validation:`, errors.join('; '));
      return { status: 'failed', reason: 'invalid_patch' };
    }

    const { error: writeError } = await supabase.from('nexus_class_video_meta').upsert(
      {
        scheduled_class_id: classId,
        ...patch,
        status: 'draft',
        generated_at: new Date().toISOString(),
        // NULL is the "the machine wrote this" marker skipReason keys off, and
        // what lets the panel tell the teacher this is a draft to review.
        generated_by: null,
      },
      { onConflict: 'scheduled_class_id' },
    );

    // PostgREST hands back { error } rather than throwing, so an unchecked write
    // here would report success on every class forever.
    if (writeError) {
      console.error(`[video-meta-ai] STORE FAILED for class ${classId}:`, writeError.message);
      return { status: 'failed', reason: `store: ${writeError.message}` };
    }

    return { status: 'generated', warnings: result.warnings };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'exception';
    console.error(`[video-meta-ai] class ${classId} failed:`, err);
    return { status: 'failed', reason };
  }
}
