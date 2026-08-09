import type { ShareSection } from '@/lib/class-share-model';
import type { ExamResultsSummary, RankedCandidate } from '@neram/database';

/**
 * What the Teams channel is told about an exam, and what each student is told
 * privately.
 *
 * PURE, and it builds ShareSection[] so renderShareText and renderShareHtml can
 * be reused verbatim. That is the biggest reuse win in this feature: the card
 * matches every other Nexus announcement, and the existing anti-drift test that
 * asserts the text and HTML carry an identical set of URLs comes along free.
 *
 * THE PRIVACY DECISION, and it is deliberate: the channel gets participation,
 * the average, the highest mark, the section averages, and the top three named.
 * Every other student's marks go to that student alone. Publishing a full
 * ranked list would put the bottom of the class in a group chat that their
 * peers, and often their parents, can read forever.
 */

function pct(n: number): string {
  return `${Math.round(n * 10) / 10}%`;
}

function marks(score: number, total: number): string {
  return total > 0 ? `${round1(score)}/${round1(total)}` : `${round1(score)}`;
}

function round1(n: number): number {
  return Math.round(Number(n) * 10) / 10;
}

const MEDALS = ['1st', '2nd', '3rd'];

export interface ExamPostInput {
  examTitle: string;
  classroomName: string | null;
  results: ExamResultsSummary;
  /** True when drawings are still unmarked, so the card says so rather than implying finality. */
  provisional: boolean;
  /** Where a student goes to see their own paper. */
  resultUrl?: string | null;
}

/**
 * The channel card.
 *
 * Sections are toggleable so a teacher can drop the podium (a class that had a
 * hard day) or the section averages (a paper with one section) from the preview
 * before sending.
 */
export function buildExamResultSections(input: ExamPostInput): ShareSection[] {
  const { results, examTitle } = input;
  const sections: ShareSection[] = [];

  sections.push({
    id: 'header',
    lines: [
      { text: examTitle, strong: true },
      ...(input.classroomName ? [{ text: input.classroomName, muted: true }] : []),
      ...(input.provisional
        ? [
            {
              text: 'Provisional. The drawing section is still being marked, so these can still move.',
              muted: true,
            },
          ]
        : []),
    ],
    toggleable: false,
  });

  sections.push({
    id: 'exam_summary',
    heading: { emoji: '📊', text: 'How the class did' },
    lines: [
      {
        text: `${results.stats.sat} of ${results.stats.roster} sat the exam`,
        bullet: true,
      },
      { text: `Class average ${pct(results.stats.average)}`, bullet: true },
      { text: `Highest ${pct(results.stats.highest)}`, bullet: true },
      ...(results.stats.passing_pct != null
        ? [
            {
              text: `${results.stats.passed} cleared the ${pct(results.stats.passing_pct)} pass mark`,
              bullet: true,
            },
          ]
        : []),
    ],
    toggleable: true,
    checkboxLabel: 'Class summary',
  });

  if (results.podium.length > 0) {
    sections.push({
      id: 'exam_podium',
      heading: { emoji: '🏆', text: 'Top performers' },
      lines: results.podium.map((row, i) => ({
        text: `${MEDALS[i] ?? `${row.rank}th`}  ${row.student_name}  ${marks(row.score, row.total_marks)} (${pct(row.percentage)})`,
        bullet: false,
        strong: i === 0,
      })),
      toggleable: true,
      checkboxLabel: `Top ${results.podium.length}`,
    });
  }

  if (results.section_averages.length > 1) {
    sections.push({
      id: 'exam_sections',
      heading: { emoji: '📚', text: 'Section by section' },
      lines: results.section_averages.map((s) => ({
        text: `${s.label}: average ${round1(s.average)} of ${round1(s.total_marks)}`,
        bullet: true,
      })),
      toggleable: true,
      checkboxLabel: 'Section averages',
    });
  }

  sections.push({
    id: 'exam_footer',
    lines: [
      {
        text: 'Your own rank and marks are in Nexus, under your notifications.',
        muted: true,
        ...(input.resultUrl ? { url: input.resultUrl } : {}),
      },
    ],
    toggleable: false,
  });

  return sections;
}

/**
 * The private message one student gets.
 *
 * Carries their rank, which the channel card never does for anyone outside the
 * top three. Plain text, because sendNudge fans out to a Teams activity ping,
 * an in-app row and an email, and the lowest common denominator has to read
 * well in all three.
 */
export function buildStudentResultMessage(input: {
  examTitle: string;
  row: RankedCandidate;
  totalSat: number;
  provisional: boolean;
  passingPct: number | null;
}): { subject: string; plain: string } {
  const { row, examTitle } = input;

  if (row.absent || !row.attempt_id) {
    return {
      subject: `${examTitle}: you were marked absent`,
      plain: `Results for ${examTitle} are out. You were marked absent because no attempt was recorded. If that is wrong, speak to your teacher: they can open a second window for you.`,
    };
  }

  const lines: string[] = [
    `Results for ${examTitle} are out.`,
    '',
    `Your score: ${marks(row.score, row.total_marks)} (${pct(row.percentage)})`,
    `Your rank: ${ordinal(row.rank)} of ${input.totalSat}`,
  ];

  if (input.passingPct != null) {
    lines.push(row.percentage >= input.passingPct ? 'You cleared the pass mark.' : 'You did not clear the pass mark this time.');
  }

  if (row.section_scores.length > 1) {
    lines.push('', 'Section by section:');
    for (const s of row.section_scores) {
      lines.push(
        s.ungraded > 0 && s.total_marks === 0
          ? `  ${s.label}: still being marked`
          : `  ${s.label}: ${marks(s.score, s.total_marks)}`,
      );
    }
  }

  if (input.provisional) {
    lines.push('', 'This is provisional. Your drawing is still being marked, so your total can still change.');
  }

  return { subject: `${examTitle}: your result`, plain: lines.join('\n') };
}

function ordinal(n: number | null): string {
  if (n == null) return 'unranked';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
