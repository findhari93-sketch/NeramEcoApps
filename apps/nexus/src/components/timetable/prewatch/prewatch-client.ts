/**
 * Browser-side calls for "watch before class". One place builds the URLs so the
 * Add Class field, the picker and the class panel cannot drift apart.
 */
import { pickKey, pickOfRow, type PrewatchItem, type PrewatchPick } from '@/lib/prewatch';
import type { PrewatchCandidate } from '@/lib/prewatch-suggest';

/** What is being scheduled, for ranking. */
export interface PrewatchContext {
  q?: string;
  courseTopicId?: string | null;
  classroomIds?: string[];
  /** The class being edited, never offered to itself. */
  excludeClassId?: string | null;
  /** Keys already picked, left out of the suggestions strip. */
  exclude?: string[];
}

export interface PrewatchCandidateLists {
  suggestions: PrewatchCandidate[];
  recordings: PrewatchCandidate[];
  library: PrewatchCandidate[];
}

export async function fetchPrewatchCandidates(
  ctx: PrewatchContext,
  getToken: () => Promise<string | null>,
  signal?: AbortSignal,
): Promise<PrewatchCandidateLists> {
  const token = await getToken();
  if (!token) throw new Error('Not signed in');
  const params = new URLSearchParams();
  if (ctx.q?.trim()) params.set('q', ctx.q.trim());
  if (ctx.courseTopicId) params.set('course_topic_id', ctx.courseTopicId);
  if (ctx.classroomIds?.length) params.set('classroom_ids', ctx.classroomIds.join(','));
  if (ctx.excludeClassId) params.set('exclude_class_id', ctx.excludeClassId);
  if (ctx.exclude?.length) params.set('exclude', ctx.exclude.join(','));
  const res = await fetch(`/api/timetable/prewatch-suggestions?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!res.ok) throw new Error(`Suggestions failed (${res.status})`);
  const data = await res.json();
  return {
    suggestions: data.suggestions || [],
    recordings: data.recordings || [],
    library: data.library || [],
  };
}

/** The picks a list of candidates stands for, in order. */
export function picksOf(candidates: PrewatchCandidate[]): PrewatchPick[] {
  return candidates.map((c) => ({ kind: c.kind, id: c.id }));
}

/** A stored item shown as a candidate, so edit mode reuses the same rows. */
export function candidateOfItem(item: PrewatchItem): PrewatchCandidate {
  const pick = pickOfRow(item) as PrewatchPick;
  return {
    key: pickKey(pick),
    kind: pick.kind,
    id: pick.id,
    title: item.title,
    subtitle: item.source_label || '',
    thumb_url: item.thumb_url,
    duration_seconds: item.duration_seconds,
  };
}

/** Same videos, same order? Saves a PUT when nothing changed. */
export function samePicks(a: PrewatchCandidate[], b: PrewatchCandidate[]): boolean {
  return a.length === b.length && a.every((c, i) => c.key === b[i].key);
}
