/**
 * What a teacher needs to know about one chapter, computed from what the two
 * existing endpoints already return.
 *
 * The teacher's own chapter has been read-only since it shipped: attaching a
 * test, attaching recordings and seeing who is studying all live behind the
 * grid card's menu, so answering "does this chapter work" meant closing the
 * document. Nothing on screen ever said a chapter had no test, or that its one
 * recording was a draft nobody could see.
 *
 * Both functions here are pure, and deliberately so. The rule that decides what
 * a student is served has been written three times in this feature already (the
 * query layer, the language board, the student panel) and the wrong copy is the
 * one that goes stale. isServableTrack is that rule, once.
 *
 * Pure TypeScript, no JSX and no next/* imports, so the rail, the completion
 * page and any future caller share it.
 */

/** A language track, as /api/study-materials/files/[id]/video-tracks returns it. */
export interface WorkspaceTrack {
  language: string;
  language_label: string;
  status: string;
  readiness?: string | null;
}

/** One student's row, as /api/study-materials/reports/chapter/[fileId] returns it. */
export interface WorkspaceReportRow {
  video_language?: string | null;
}

/** Enough of the file DTO to describe the chapter. */
export interface WorkspaceFile {
  has_test?: boolean;
  downloadable?: boolean;
  recording?: { source?: string; url?: string | null; youtube_id?: string | null } | null;
}

/** The chapter's placed test, as getPlacedChapterTest returns it. */
export interface PlacedChapterTest {
  test_id: string;
  title: string;
  /** How many one sitting asks. For a pool this is the serve count. */
  question_count: number;
  /** The whole pool, when the test holds more than it serves. */
  pool_size: number | null;
  passing_pct: number;
  is_published: boolean;
}

/**
 * Is this recording actually reaching students?
 *
 * Published AND ready, matching isServable in the query layer exactly. Testing
 * status alone is the mistake worth guarding: a track held at readiness
 * 'pending' is published in the teacher's sense and invisible in the student's,
 * and a checklist that called that "live" would be worse than no checklist.
 *
 * A null readiness is ready: the column was added after the first tracks were
 * written and its absence means "nothing was ever holding this back".
 */
export function isServableTrack(track: WorkspaceTrack): boolean {
  return track.status === 'published' && (track.readiness ?? 'ready') === 'ready';
}

export interface WatchLanguageTally {
  code: string;
  label: string;
  count: number;
}

export interface WatchSummary {
  languages: WatchLanguageTally[];
  /** Students with no recording finished, in any language. */
  notWatched: number;
}

/**
 * How many students finished in each language, and how many in none.
 *
 * The report has returned `video_language` since the tracks shipped and nothing
 * has ever drawn it, so "how many watched the English one" has never been on a
 * screen despite being one count away.
 *
 * Two decisions worth stating. A language with nobody on it is still listed,
 * because "English 0, தமிழ் 0, not watched 18" is the informative line on a
 * chapter nobody has started and an empty row reads as "we do not track this".
 * And a language no longer offered still appears, under its bare code, because
 * removing a track does not un-watch the students who finished it and dropping
 * them would quietly shrink the cohort.
 */
export function summariseWatchLanguages(
  rows: WorkspaceReportRow[],
  tracks: WorkspaceTrack[],
): WatchSummary {
  const counts = new Map<string, number>();
  const labels = new Map<string, string>();

  // Seed from the offered languages, in the order they are offered, so the
  // zeroes are present and the order matches the cards above.
  for (const t of tracks) {
    if (!counts.has(t.language)) {
      counts.set(t.language, 0);
      labels.set(t.language, t.language_label || t.language);
    }
  }

  let notWatched = 0;
  for (const row of rows) {
    const code = row.video_language;
    if (!code) {
      notWatched += 1;
      continue;
    }
    counts.set(code, (counts.get(code) ?? 0) + 1);
    // Bare code rather than blank: ugly, and far better than an unlabelled
    // number a teacher cannot attribute to anything.
    if (!labels.has(code)) labels.set(code, code);
  }

  return {
    languages: [...counts.entries()].map(([code, count]) => ({
      code,
      label: labels.get(code) || code,
      count,
    })),
    notWatched,
  };
}

export type ReadinessState = 'ready' | 'attention' | 'missing' | 'info';

export interface ReadinessLine {
  key: 'test' | 'recordings' | 'quick_link' | 'download';
  title: string;
  /** One sentence, stating the fact rather than the instruction. */
  detail: string;
  state: ReadinessState;
  /** Missing this does not stop a student completing the chapter. */
  optional: boolean;
}

/**
 * The chapter, line by line, in the order a teacher would fix it.
 *
 * Always returns all four keys so the checklist never changes shape between
 * chapters, which is what lets a teacher scan a folder of them.
 */
export function chapterReadiness(
  file: WorkspaceFile,
  tracks: WorkspaceTrack[],
  placedTest?: PlacedChapterTest | null,
): ReadinessLine[] {
  const servable = tracks.filter(isServableTrack);

  /**
   * An unpublished test is the trap worth naming.
   *
   * The chapter reports has_test either way, so a paper linked and left in
   * draft looks finished from every screen while serving nobody. That is the
   * same shape of mistake as a recording held at readiness 'pending', and it
   * deserves the same amber rather than a green tick.
   */
  let test: ReadinessLine;
  if (placedTest) {
    const pool =
      placedTest.pool_size && placedTest.pool_size > placedTest.question_count
        ? `${placedTest.question_count} asked each attempt, drawn from ${placedTest.pool_size}.`
        : `${placedTest.question_count} questions.`;
    test = placedTest.is_published
      ? {
          key: 'test',
          title: 'Test',
          detail: `${pool} Pass ${placedTest.passing_pct}%.`,
          state: 'ready',
          optional: false,
        }
      : {
          key: 'test',
          title: 'Test',
          detail: `${pool} Not published, so students cannot take it.`,
          state: 'attention',
          optional: false,
        };
  } else if (file.has_test) {
    // Known to exist, not yet read in detail: the file DTO says so but the
    // placed test has not loaded, or this caller never asks for it.
    test = { key: 'test', title: 'Test', detail: 'Attached.', state: 'ready', optional: false };
  } else {
    test = {
      key: 'test',
      title: 'Test',
      detail: 'No test yet, so students cannot complete this chapter.',
      state: 'missing',
      optional: false,
    };
  }

  /**
   * Recordings are optional even when absent.
   *
   * A chapter with no track has no video gate, so its test is simply open and
   * the chapter completes on the test alone. Marking that as a blocker would
   * put a red line on nine chapters that are working exactly as intended.
   */
  const recordings: ReadinessLine = servable.length
    ? {
        key: 'recordings',
        title: 'Recordings',
        detail: `Students see: ${servable.map((t) => t.language_label).join(', ')}.`,
        state: 'ready',
        optional: true,
      }
    : tracks.length
      ? {
          key: 'recordings',
          title: 'Recordings',
          detail: `${tracks.length} added, students see nothing yet.`,
          state: 'attention',
          optional: true,
        }
      : {
          key: 'recordings',
          title: 'Recordings',
          detail: 'None. The test is open without one.',
          state: 'missing',
          optional: true,
        };

  const quickLink: ReadinessLine = file.recording
    ? {
        key: 'quick_link',
        title: 'Quick video link',
        detail: 'A link is attached, ungated.',
        state: 'info',
        optional: true,
      }
    : {
        key: 'quick_link',
        title: 'Quick video link',
        detail: 'None.',
        state: 'info',
        optional: true,
      };

  // Never a fault in either direction: view-only is the deliberate default and
  // allowing downloads is a deliberate choice. Stated so it is not a surprise.
  const download: ReadinessLine = {
    key: 'download',
    title: 'Download',
    detail: file.downloadable ? 'Students can download this file.' : 'View only.',
    state: 'info',
    optional: true,
  };

  return [test, recordings, quickLink, download];
}

/** The lines that actually stop a student finishing. Usually none, or the test. */
export function chapterBlockers(lines: ReadinessLine[]): ReadinessLine[] {
  return lines.filter((l) => !l.optional && l.state === 'missing');
}
