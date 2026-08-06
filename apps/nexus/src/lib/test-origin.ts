/**
 * Where a test came from, turned into something a teacher can read.
 *
 * nexus_test_imports has recorded all of this since it shipped and none of it
 * has ever reached a screen. Upload 150 questions to a chapter and the app can
 * tell you the filename, the chapter, the folder, how many rows it read, how
 * many it dropped and what it set the pool to, and shows you none of it. The
 * question that prompted this was exactly that: which JSON built this, and did
 * everything in it survive.
 *
 * Separate from describeTestContent in test-provenance.ts on purpose, and for
 * the same reason that one is separate from buildContentSummary: this describes
 * the PROVENANCE (one archived row, one moment) while that describes the
 * CONTENT (papers, categories, difficulty). They answer different questions and
 * change for different reasons.
 *
 * Pure TypeScript, no JSX and no next/* imports, so the test page, the chapter
 * rail and the question detail can share one wording.
 */

export interface TestOriginFacts {
  /** nexus_test_imports.source */
  source?: string | null;
  /** nexus_tests.created_from, kept for callers that have it. */
  created_from?: string | null;
  /** nexus_test_imports.prompt_meta. Free-form jsonb, so trusted for nothing. */
  prompt_meta?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TestOrigin {
  /** One sentence: how this test came to exist. */
  headline: string;
  /** Supporting facts, each a complete phrase, only when actually recorded. */
  details: string[];
  /** The uploaded document's name, when there was one. */
  fileName: string | null;
  /** Rows the import read and did not keep. Worth a teacher's attention. */
  hasLoss: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * '6 Aug 2026', in UTC.
 *
 * Deliberately not toLocaleDateString. A stored timestamp is one moment, and a
 * row that reads "6 Aug" for a teacher in Chennai and "5 Aug" for a reviewer
 * elsewhere is a record two people cannot discuss. Empty string for anything
 * unparseable, so a caller never prints "Invalid Date".
 */
export function formatOriginDate(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Read a string off free-form jsonb without trusting any of it. */
function str(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed ? trimmed : null;
}

/** Read a non-negative integer off free-form jsonb. */
function num(meta: Record<string, unknown>, key: string): number | null {
  const v = meta[key];
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function describeTestOrigin(facts: TestOriginFacts | null | undefined): TestOrigin {
  // No archived row at all. Every test built before this table existed is in
  // that position, and inventing an origin for them would present a guess as a
  // record.
  if (!facts) {
    return {
      headline: 'How this test was built was not recorded.',
      details: [],
      fileName: null,
      hasLoss: false,
    };
  }

  const meta: Record<string, unknown> =
    facts.prompt_meta && typeof facts.prompt_meta === 'object' && !Array.isArray(facts.prompt_meta)
      ? (facts.prompt_meta as Record<string, unknown>)
      : {};

  const fileName = str(meta, 'file_name');
  const chapter = str(meta, 'source_file_title');
  const when = formatOriginDate(facts.created_at);

  let headline: string;
  switch (facts.source) {
    case 'file_upload':
      // Guarded: without the name this used to read "Uploaded from ." on every
      // import made before the filename was recorded.
      headline = fileName ? `Uploaded from ${fileName}.` : 'Uploaded as a JSON file.';
      break;
    case 'paste':
      headline = 'Pasted in as JSON.';
      break;
    case 'pdf_generate':
      headline = chapter ? `Written by AI from ${chapter}.` : 'Written by AI from a PDF.';
      break;
    case 'edit':
      headline = 'Edited by hand after it was built.';
      break;
    default:
      headline = 'Built in the Tests module.';
  }
  if (when) headline += ` ${when}.`;

  const details: string[] = [];

  // The chapter is already in the headline for an AI generation, so naming it
  // twice would read as padding.
  if (chapter && facts.source !== 'pdf_generate') details.push(`Built for ${chapter}.`);

  const folder = Array.isArray(meta.folder_path)
    ? (meta.folder_path as unknown[]).filter((p): p is string => typeof p === 'string' && !!p.trim())
    : [];
  if (folder.length) details.push(`Filed under ${folder.join(' / ')}.`);

  const read = num(meta, 'questions_read');
  const serve = num(meta, 'serve');
  if (read != null) {
    // A pool holds more than it asks, and the two numbers being different is
    // the single most misread thing about these tests.
    details.push(
      serve != null && serve > 0 && serve < read
        ? `${read} read, ${serve} asked each attempt.`
        : `${read} questions read.`,
    );
  }

  const skipped = num(meta, 'rows_skipped');
  const hasLoss = skipped != null && skipped > 0;
  // Silent only when nothing was lost. Printing "0 skipped" on every import is
  // how people learn to stop reading the line that matters.
  if (hasLoss) details.push(`${skipped} rows skipped as unusable.`);

  const passing = num(meta, 'passing_pct');
  if (passing != null) details.push(`Pass mark ${passing}%.`);

  const edited = formatOriginDate(facts.updated_at);
  if (edited && edited !== when) details.push(`Last edited ${edited}.`);

  return { headline, details, fileName, hasLoss };
}
