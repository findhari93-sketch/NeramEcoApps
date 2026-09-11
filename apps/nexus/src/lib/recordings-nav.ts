/**
 * Every link between the chapter, its recordings and a recording's checkpoints.
 *
 * The journey is three levels deep:
 *
 *   /teacher/study-materials/[fileId]?tab=setup                     the chapter
 *   /teacher/study-materials/[fileId]/recordings?lang=ta             its recordings
 *   /teacher/study-materials/[fileId]/recordings/[trackId]/checkpoints
 *
 * and each Back goes exactly one level up. It used to go to the Study Materials
 * root from the checkpoint editor, which dropped a teacher out of the chapter and
 * the language they were working on in one press.
 *
 * WHERE THE TEACHER CAME FROM is the one thing that changes Back on the
 * recordings page: the chapter's Setup tab, or the library folder whose file menu
 * opened it. It travels as `from`, and `from` is an enum rather than a return
 * path. Nothing a URL says can make Back point anywhere these functions would
 * not have built themselves.
 *
 * Pure TypeScript, no JSX and no next/* imports.
 */

import { isValidTrackLanguageCode } from './track-languages';

export type RecordingsFrom = 'chapter' | 'library';

const BASE = '/teacher/study-materials';

/** Only the exact string 'library' means the library. Anything else is the chapter. */
export function parseRecordingsFrom(raw: unknown): RecordingsFrom {
  return raw === 'library' ? 'library' : 'chapter';
}

/** A query string from the params that have a value, in the order given. */
function query(params: Record<string, string | null | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) qs.set(key, value);
  }
  const text = qs.toString();
  return text ? `?${text}` : '';
}

/** Written only when it changes Back, so the ordinary link stays short. */
const fromParam = (from?: RecordingsFrom | null) => (from === 'library' ? 'library' : null);

export function chapterSetupHref(fileId: string): string {
  return `${BASE}/${encodeURIComponent(fileId)}?tab=setup`;
}

export function recordingsHref(input: {
  fileId: string;
  lang?: string | null;
  from?: RecordingsFrom | null;
}): string {
  const lang =
    input.lang && isValidTrackLanguageCode(input.lang) ? input.lang.trim().toLowerCase() : null;
  return `${BASE}/${encodeURIComponent(input.fileId)}/recordings${query({
    lang,
    from: fromParam(input.from),
  })}`;
}

/** Back and Done on the recordings page. */
export function recordingsBackHref(input: {
  fileId: string;
  folderId?: string | null;
  from?: RecordingsFrom | null;
}): string {
  if (input.from === 'library') {
    return input.folderId ? `${BASE}?folder=${encodeURIComponent(input.folderId)}` : BASE;
  }
  return chapterSetupHref(input.fileId);
}

export function recordingsBackLabel(from: RecordingsFrom): string {
  return from === 'library' ? 'Back to Study Materials' : 'Back to chapter';
}

export function checkpointsHref(input: {
  fileId: string;
  trackId: string;
  from?: RecordingsFrom | null;
}): string {
  return `${BASE}/${encodeURIComponent(input.fileId)}/recordings/${encodeURIComponent(
    input.trackId,
  )}/checkpoints${query({ from: fromParam(input.from) })}`;
}
