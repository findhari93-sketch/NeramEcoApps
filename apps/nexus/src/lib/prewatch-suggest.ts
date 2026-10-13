/**
 * Suggesting "watch before class" videos while a teacher schedules a class.
 *
 * The teacher types "Human on Streets" and Nexus offers the past classes and
 * Library videos that look like it. Nothing attaches until they tap one, so a
 * weak match costs a glance, never a wrong video in front of students.
 *
 * Library ranking comes from the library_search RPC (full text, tag aliases,
 * trigram). Past class recordings are few (dozens), so they are scored here in
 * memory: same course topic first, then words shared with the title, the tags
 * and the description. Pure module.
 */
import { extractYouTubeId } from './youtube';
import { isGraphApiUrl } from './class-links';
import { youtubeThumb } from './class-resources';
import { formatClassDate, libraryTitle, pickKey, type PrewatchKind } from './prewatch';

/**
 * Words that say nothing about the topic. "class", "session" and the like appear
 * in half the titles, so matching on them would rank everything equally.
 */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'the', 'of', 'on', 'in', 'to', 'for', 'by', 'with', 'at', 'from', 'is', 'are', 'how',
  'what', 'why', 'class', 'classes', 'session', 'sessions', 'part', 'lecture', 'live', 'day', 'week',
  'intro', 'introduction', 'basics', 'revision', 'recap',
]);

/** Lowercased content words, without stopwords, one-letter tokens or repeats. */
export function tokenize(text: string | null | undefined): string[] {
  const words = (text || '').toLowerCase().split(/[^\p{L}\p{N}]+/u);
  const out: string[] = [];
  for (const w of words) {
    if (w.length < 2 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
    if (!out.includes(w)) out.push(w);
  }
  return out;
}

/**
 * Does a query word appear in a text's words?
 *
 * Exact, or a shared stem of four letters or more, so "street" finds "Streets"
 * and "perspective" finds "perspectives" without "art" finding "party".
 */
function hits(words: string[], token: string): boolean {
  return words.some((w) => {
    if (w === token) return true;
    if (Math.min(w.length, token.length) < 4) return false;
    return w.startsWith(token) || token.startsWith(w);
  });
}

/** A past class with a recording, as the suggestion query loads it. */
export interface RecordingRow {
  id: string;
  title: string | null;
  description: string | null;
  scheduled_date: string;
  classroom_id: string | null;
  classroom_name: string | null;
  course_topic_id: string | null;
  recording_url: string | null;
  youtube_url: string | null;
  recording_duration_minutes: number | null;
  /** Set when the class was also published to the Library. */
  library_video_id: string | null;
  tags: string[];
}

export interface ScoreContext {
  tokens: string[];
  courseTopicId?: string | null;
  classroomIds?: string[];
  /** `YYYY-MM-DD`, for the recency nudge. */
  today: string;
}

const TOPIC_MATCH = 3;

/**
 * How well a past class matches what is being scheduled. 0 means "do not offer".
 *
 * The course topic is the strongest signal (a teacher who picked the topic has
 * told us exactly what this is), worth more than any amount of word overlap.
 * Word overlap is normalised by the number of query words, so a long title is
 * not favoured for being long. Same classroom and recency only break ties
 * between real matches; they never make a non-match appear.
 */
export function scoreRecording(ctx: ScoreContext, rec: RecordingRow): number {
  const topic = !!ctx.courseTopicId && rec.course_topic_id === ctx.courseTopicId ? TOPIC_MATCH : 0;

  let text = 0;
  if (ctx.tokens.length) {
    const title = tokenize(rec.title);
    const tags = tokenize(rec.tags.join(' '));
    const description = tokenize(rec.description);
    let sum = 0;
    for (const t of ctx.tokens) {
      if (hits(title, t)) sum += 1;
      if (hits(tags, t)) sum += 1;
      if (hits(description, t)) sum += 0.5;
    }
    text = sum / ctx.tokens.length;
  }

  if (topic === 0 && text === 0) return 0;

  let boost = 0;
  if (rec.classroom_id && ctx.classroomIds?.includes(rec.classroom_id)) boost += 0.25;
  const ageDays = daysBetween(rec.scheduled_date, ctx.today);
  if (ageDays !== null && ageDays >= 0) boost += 0.25 * Math.max(0, 1 - ageDays / 365);

  return topic + text + boost;
}

function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Can a student actually play this class's recording?
 *
 * A SharePoint recording plays through the byte proxy; a stored Graph API URL
 * cannot (it needs a bearer token, see isGraphApiUrl), so it only counts when a
 * YouTube backup exists.
 */
export function isPlayableRecording(rec: { recording_url: string | null; youtube_url: string | null }): boolean {
  if (rec.recording_url && !isGraphApiUrl(rec.recording_url)) return true;
  return !!extractYouTubeId(rec.youtube_url);
}

/** A video the teacher can attach, from either source. */
export interface PrewatchCandidate {
  key: string;
  kind: PrewatchKind;
  /** Library video id, or the past class id. */
  id: string;
  title: string;
  /** "Library", or "JEE B.Arch Session 1, 3 Oct 2026". */
  subtitle: string;
  thumb_url: string | null;
  duration_seconds: number | null;
  /** Past class only: its Library copy, used to drop the duplicate. */
  library_video_id?: string | null;
  /** Past class only: it is on the topic the teacher picked. */
  topic_match?: boolean;
  score?: number;
}

/** A library_search row as a candidate. */
export function libraryCandidate(v: {
  id: string;
  youtube_video_id: string | null;
  approved_title?: string | null;
  suggested_title?: string | null;
  original_title?: string | null;
  youtube_thumbnail_url?: string | null;
  youtube_thumbnail_hq_url?: string | null;
  duration_seconds?: number | null;
}): PrewatchCandidate {
  return {
    key: pickKey({ kind: 'library_video', id: v.id }),
    kind: 'library_video',
    id: v.id,
    title: libraryTitle(v),
    subtitle: 'Library',
    thumb_url: v.youtube_thumbnail_hq_url || v.youtube_thumbnail_url || (v.youtube_video_id ? youtubeThumb(v.youtube_video_id) : null),
    duration_seconds: v.duration_seconds ?? null,
  };
}

/** A past class as a candidate. */
export function recordingCandidate(rec: RecordingRow, ctx?: ScoreContext): PrewatchCandidate {
  const ytId = extractYouTubeId(rec.youtube_url);
  const date = formatClassDate(rec.scheduled_date);
  return {
    key: pickKey({ kind: 'class_recording', id: rec.id }),
    kind: 'class_recording',
    id: rec.id,
    title: (rec.title || 'Class recording').trim(),
    subtitle: [rec.classroom_name, date].filter(Boolean).join(', '),
    thumb_url: ytId ? youtubeThumb(ytId) : null,
    duration_seconds: rec.recording_duration_minutes ? rec.recording_duration_minutes * 60 : null,
    library_video_id: rec.library_video_id,
    topic_match: !!ctx?.courseTopicId && rec.course_topic_id === ctx.courseTopicId,
    score: ctx ? scoreRecording(ctx, rec) : undefined,
  };
}

/** Past classes worth offering, best first. */
export function rankRecordings(ctx: ScoreContext, rows: RecordingRow[]): PrewatchCandidate[] {
  return rows
    .filter(isPlayableRecording)
    .map((r) => recordingCandidate(r, ctx))
    .filter((c) => (c.score ?? 0) > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

/**
 * The short "Suggested for this class" list.
 *
 * Past classes on the chosen topic lead. After that the two sources alternate,
 * so neither crowds the other out. A past class that was also published to the
 * Library appears once, as the Library copy: it is the same video, and YouTube
 * playback costs nothing where the SharePoint proxy costs an invocation per
 * chunk. Anything already picked is left out.
 */
export function mergeSuggestions(
  recordings: PrewatchCandidate[],
  library: PrewatchCandidate[],
  opts: { limit: number; exclude?: Iterable<string> },
): PrewatchCandidate[] {
  const exclude = new Set(opts.exclude || []);
  const libraryIds = new Set(library.map((l) => l.id));
  const recs = recordings.filter(
    (r) => !exclude.has(r.key) && !(r.library_video_id && libraryIds.has(r.library_video_id)),
  );
  const libs = library.filter((l) => !exclude.has(l.key));

  const out: PrewatchCandidate[] = [];
  const seen = new Set<string>();
  const push = (c: PrewatchCandidate | undefined) => {
    if (!c || seen.has(c.key) || out.length >= opts.limit) return;
    seen.add(c.key);
    out.push(c);
  };

  recs.filter((r) => r.topic_match).forEach(push);
  const rest = recs.filter((r) => !r.topic_match);
  for (let i = 0; out.length < opts.limit && (i < rest.length || i < libs.length); i++) {
    push(rest[i]);
    push(libs[i]);
  }
  return out;
}
