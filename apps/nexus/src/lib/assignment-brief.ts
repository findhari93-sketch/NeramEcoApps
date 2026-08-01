/**
 * Read structure out of an assignment's instructions blob.
 *
 * Assignments store their whole brief as one TEXT column, and it renders as one
 * undifferentiated column of body text: question headings, coordinates, mark
 * values and submission rules all at the same weight. A four-question maths
 * paper reads as a wall.
 *
 * Rather than make every teacher re-author what they have already written, this
 * finds the shape that is already in the text. "Q3. Find the Area of a Triangle
 * (5 Marks)" is a heading with a mark value whether or not anything ever treated
 * it as one.
 *
 * The parser is deliberately shy. It only claims a heading it is sure about,
 * because a false positive (splitting mid-question) reads far worse than the
 * plain text it replaces. When it finds nothing, callers render the original
 * text untouched and still gain maths rendering and proper typography.
 *
 * Pure and framework-free, so the composer in Phase 3 can reuse it to turn a
 * pasted brief into real question rows.
 */

export interface BriefQuestion {
  /** Display label as written, e.g. "Q1". */
  label: string;
  /** Heading text with the mark value removed, or '' when the heading was bare. */
  title: string;
  /** Marks lifted out of the heading, or null when none were stated. */
  marks: number | null;
  /** Everything under the heading, up to the next one. */
  body: string;
}

export interface AssignmentBriefModel {
  /** Anything before the first question heading. */
  intro: string;
  questions: BriefQuestion[];
  /** Lines of the closing "Submission Guidelines" block, if there is one. */
  guidelines: string[];
  /** Sum of the per-question marks, or null when no question stated any. */
  totalMarks: number | null;
  /** False when nothing was recognised and the raw text should be shown as-is. */
  structured: boolean;
}

/** "Q1." / "Q1)" / "Question 1:" and friends. The Q prefix is required. */
const Q_HEADING = /^\s*(?:Q|Question)\s*(\d{1,3})\s*[.):-]?\s*(.*)$/i;

/**
 * Bare "1." / "2)" numbering. Only consulted when the text has no Q-prefixed
 * headings at all, because guidelines are commonly numbered the same way and
 * mistaking those for questions would shred the brief.
 */
const BARE_HEADING = /^\s*(\d{1,3})\s*[.)]\s+(\S.*)$/;

/** "(5 Marks)", "[5 marks]", "- 5 mark", "5 Marks" at the end of a heading. */
const MARKS = /[([-]?\s*(\d+(?:\.\d+)?)\s*marks?\s*[)\]]?\s*$/i;

/** A line that opens the closing block of submission rules. */
const GUIDELINES_HEADING =
  /^\s*(?:submission\s+guidelines|submission\s+instructions|guidelines|instructions|how\s+to\s+submit|note)\s*:?\s*$/i;

/** Bullet or numbering characters a teacher may have typed in front of a rule. */
const BULLET_PREFIX = /^\s*(?:[-*•·]|\d{1,2}[.)])\s+/;

function extractMarks(heading: string): { title: string; marks: number | null } {
  const m = heading.match(MARKS);
  if (!m) return { title: heading.trim(), marks: null };
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return { title: heading.trim(), marks: null };
  return { title: heading.slice(0, m.index).trim(), marks: value };
}

export function parseAssignmentBrief(instructions: string | null | undefined): AssignmentBriefModel {
  const empty: AssignmentBriefModel = {
    intro: '',
    questions: [],
    guidelines: [],
    totalMarks: null,
    structured: false,
  };
  if (!instructions || !instructions.trim()) return empty;

  const lines = instructions.replace(/\r\n/g, '\n').split('\n');

  // Split the guidelines block off first, so its numbered rules can never be
  // mistaken for questions by the bare-numbering fallback below.
  let guidelines: string[] = [];
  let bodyLines = lines;
  const gIdx = lines.findIndex((l) => GUIDELINES_HEADING.test(l));
  if (gIdx !== -1) {
    bodyLines = lines.slice(0, gIdx);
    guidelines = lines
      .slice(gIdx + 1)
      .map((l) => l.replace(BULLET_PREFIX, '').trim())
      .filter(Boolean);
  }

  const hasQPrefixed = bodyLines.some((l) => Q_HEADING.test(l));
  const headingOf = (line: string): { label: string; rest: string } | null => {
    if (hasQPrefixed) {
      const m = line.match(Q_HEADING);
      return m ? { label: `Q${m[1]}`, rest: m[2] } : null;
    }
    const m = line.match(BARE_HEADING);
    return m ? { label: `Q${m[1]}`, rest: m[2] } : null;
  };

  const questions: BriefQuestion[] = [];
  const introLines: string[] = [];
  let current: { label: string; title: string; marks: number | null; body: string[] } | null = null;

  for (const line of bodyLines) {
    const heading = headingOf(line);
    if (heading) {
      if (current) questions.push({ ...current, body: current.body.join('\n').trim() });
      const { title, marks } = extractMarks(heading.rest);
      current = { label: heading.label, title, marks, body: [] };
      continue;
    }
    if (current) current.body.push(line);
    else introLines.push(line);
  }
  if (current) questions.push({ ...current, body: current.body.join('\n').trim() });

  const stated = questions.filter((q) => q.marks != null);
  return {
    intro: introLines.join('\n').trim(),
    questions,
    guidelines,
    totalMarks: stated.length ? stated.reduce((sum, q) => sum + (q.marks || 0), 0) : null,
    structured: questions.length > 0 || guidelines.length > 0,
  };
}
