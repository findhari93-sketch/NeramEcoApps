/**
 * Writing a class wrap-up, once, for every caller.
 *
 * This was inline in the PATCH handler of api/timetable/[classId]/wrap-up until a
 * cron needed to write the same thing unattended. Two copies of this logic is not
 * a style problem, it is a correctness one: the content lock and the sibling
 * propagation below are the only things standing between a wrapped-up class and
 * the Teams reconciler putting the old meeting subject back on its next pass, and
 * a second write path that forgot either of them would lose titles silently, the
 * way four July wrap-ups were already lost once.
 *
 * The one deliberate difference between the two callers is `editorUserId`:
 *
 *   a real user id  the teacher wrote this, hands off
 *   null            the machine wrote this, and may be redrafted
 *
 * That mirrors `nexus_class_video_meta.generated_by`, which uses NULL for the same
 * meaning. See lib/wrapup-autodraft.ts for the candidate rule that reads it.
 */

import { buildClassLinkPatch } from './class-links';
import { syncClassToLibrary } from './class-library-bridge';

/**
 * Fields that describe what the class turned out to BE, as opposed to where its
 * video lives. Only these take ownership away from the Teams meeting subject.
 */
export const CONTENT_KEYS = ['title', 'description', 'notes', 'summary_bullets'] as const;

/** Tags are replaced wholesale, and a class with a dozen of them is already noise. */
const MAX_TAGS = 12;

/** Matches the column widths; a longer value would be truncated by Postgres anyway. */
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;
const NOTES_MAX = 4000;
const MAX_BULLETS = 20;

export interface WrapUpInput {
  title?: unknown;
  description?: unknown;
  notes?: unknown;
  topic_id?: unknown;
  summary_bullets?: unknown;
  recording_url?: unknown;
  youtube_url?: unknown;
  tag_ids?: unknown;
}

/** The class row the writer needs to decide about siblings and Teams refreshes. */
export interface WrapUpClassRow {
  id: string;
  title?: string | null;
  description?: string | null;
  meeting_group_id?: string | null;
  /** Compared against the incoming link, so a re-save announces nothing. */
  youtube_url?: string | null;
}

export interface BuildWrapUpResult {
  ok: boolean;
  error?: string;
  updates: Record<string, unknown>;
  /** True when any CONTENT_KEYS field is being written. Drives the lock. */
  contentEdited: boolean;
}

/**
 * Normalise a partial wrap-up body into a column patch.
 *
 * Partial by design, and the distinction matters: a key that is ABSENT is left
 * alone, a key present but empty CLEARS the column. A teacher who pastes only the
 * YouTube link a week later must not have to restate the title and tags to do it.
 *
 * Pure, so the truncation and clearing rules are testable without a database.
 */
export function buildWrapUpUpdates(body: WrapUpInput): BuildWrapUpResult {
  const updates: Record<string, unknown> = {};

  if (body.title !== undefined) {
    const title = String(body.title || '').trim();
    if (!title) return { ok: false, error: 'Give the class a title.', updates: {}, contentEdited: false };
    updates.title = title.slice(0, TITLE_MAX);
  }
  if (body.description !== undefined) {
    const brief = String(body.description || '').trim();
    updates.description = brief ? brief.slice(0, DESCRIPTION_MAX) : null;
  }
  if (body.notes !== undefined) {
    const notes = String(body.notes || '').trim();
    updates.notes = notes ? notes.slice(0, NOTES_MAX) : null;
  }
  if (body.topic_id !== undefined) {
    updates.topic_id = body.topic_id || null;
  }
  if (body.summary_bullets !== undefined) {
    const bullets = Array.isArray(body.summary_bullets)
      ? body.summary_bullets
          .map((b: unknown) => String(b || '').trim())
          .filter(Boolean)
          .slice(0, MAX_BULLETS)
      : [];
    updates.summary_bullets = bullets.length ? bullets : null;
  }

  const links = buildClassLinkPatch(body);
  if (!links.ok) return { ok: false, error: links.error || 'Bad link', updates: {}, contentEdited: false };
  Object.assign(updates, links.patch);

  return {
    ok: true,
    updates,
    contentEdited: CONTENT_KEYS.some((k) => k in updates),
  };
}

export interface ApplyWrapUpResult {
  ok: boolean;
  error?: string;
  /** HTTP status the route should answer with when ok is false. */
  status?: number;
  /** The class saved but a tag id no longer resolves. Not a failure of the save. */
  tagWarning?: boolean;
  /** True when the lock was stamped on this write. */
  contentEdited: boolean;
  /**
   * True when what the class SAYS about itself moved, so the Teams channel card
   * is now out of date. The caller decides whether it can act on that, because
   * refreshing the card needs a delegated Graph token a cron does not have.
   */
  topicMoved: boolean;
}

/**
 * Save a wrap-up: columns, the content lock, the sibling row, tags, and the
 * Library mirror.
 *
 * Never touches Teams. That needs a caller-supplied Graph token, so it stays with
 * whoever has one.
 */
export async function applyWrapUp(
  supabase: any,
  cls: WrapUpClassRow,
  body: WrapUpInput,
  editorUserId: string | null,
): Promise<ApplyWrapUpResult> {
  const built = buildWrapUpUpdates(body);
  if (!built.ok) {
    return { ok: false, error: built.error, status: 400, contentEdited: false, topicMoved: false };
  }

  const { updates, contentEdited } = built;

  // Saying what a class turned out to be takes ownership of its content away from
  // the Teams meeting subject, which was written days earlier and could not know.
  // Without this stamp the reconciler puts the old subject back on its next pass.
  //
  // Recording links deliberately do NOT lock: pasting a YouTube URL a week later
  // says nothing about the topic.
  if (contentEdited) {
    updates.content_edited_at = new Date().toISOString();
    updates.content_edited_by = editorUserId;
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from('nexus_scheduled_classes')
      .update(updates)
      .eq('id', cls.id);
    if (error) throw error;

    // A class taught to two classrooms at once is two rows sharing one Teams
    // meeting. Wrapping up either one must carry the account (and the lock) to its
    // sibling, or the other classroom's students keep reading the meeting subject
    // and that row keeps being reverted.
    if (contentEdited && cls.meeting_group_id) {
      const sibling: Record<string, unknown> = {};
      for (const k of CONTENT_KEYS) if (k in updates) sibling[k] = updates[k];
      sibling.content_edited_at = updates.content_edited_at;
      sibling.content_edited_by = updates.content_edited_by;

      const { error: sibErr } = await supabase
        .from('nexus_scheduled_classes')
        .update(sibling)
        .eq('meeting_group_id', cls.meeting_group_id)
        .neq('id', cls.id);
      // Best-effort: this class is wrapped up either way.
      if (sibErr) console.error('Sibling wrap-up propagation failed:', sibErr);
    }
  }

  // Tags are replaced wholesale when supplied: the picker sends the complete set,
  // so a diff would only be a way to get out of step with it.
  let tagWarning = false;
  if (Array.isArray(body.tag_ids)) {
    const ids = [...new Set(body.tag_ids.map((t: unknown) => String(t)).filter(Boolean))].slice(0, MAX_TAGS);
    await supabase.from('nexus_class_tags').delete().eq('scheduled_class_id', cls.id);
    if (ids.length > 0) {
      const { error } = await supabase
        .from('nexus_class_tags')
        .insert(ids.map((tag_id) => ({ scheduled_class_id: cls.id, tag_id })));
      // A tag deleted from the registry mid-edit should not lose the rest of the
      // wrap-up, so this reports rather than throws.
      if (error) tagWarning = true;
    }
  }

  // Mirror the recording into the student Library so its tags make it searchable
  // there. Best-effort: a Library hiccup must not fail the wrap-up.
  try {
    await syncClassToLibrary(supabase, cls.id);
  } catch (bridgeErr) {
    console.error('Class -> Library sync failed:', bridgeErr);
  }

  const topicMoved =
    ('title' in updates && updates.title !== cls.title) ||
    ('description' in updates && (updates.description ?? null) !== (cls.description ?? null)) ||
    'summary_bullets' in updates ||
    // A recording appearing IS news, and the card now carries a watch link, so
    // the old rule that only a moved topic was worth re-posting no longer holds.
    // Still guarded on the value changing: re-saving the same link posts nothing,
    // which is what stops a teacher tidying up an old class from spamming the
    // channel with a video the group was told about weeks ago.
    ('youtube_url' in updates && (updates.youtube_url ?? null) !== (cls.youtube_url ?? null));

  return { ok: true, tagWarning, contentEdited, topicMoved };
}
