/**
 * What Ask aiArchitek remembers about a student, like Claude's memory but
 * always on show: the chat lists every fact as a chip the student can edit or
 * forget, and nothing is remembered that is not on that strip.
 *
 * Stored as JSON in ask_memory.facts. Everything that comes in (from the model's
 * save_my_details call, from a tool, from the chip editor, from the database)
 * goes through sanitizeFacts first, so a bad value never reaches a prompt.
 */
import { BOARD_CONFIG, type BoardType } from '@neram/tools-core/cutoff';
import { TNEA_COMMUNITIES } from './tiers';

export interface AskFacts {
  board?: BoardType;
  boardMax?: number;
  boardMarks?: number;
  /** NATA totals out of 200, one per attempt, newest last. */
  nataScores?: number[];
  /** The last cutoff out of 400 worked out in the chat. */
  cutoff?: number;
  /** TNEA community (OC, BC, BCM, MBC, SC, SCA, ST). */
  community?: string;
  state?: string;
  city?: string;
  /** The year the student sits NATA, e.g. 2027. */
  examYear?: number;
  jeeRank?: number;
  keamRank?: number;
  /** Yearly fee budget in lakh rupees. */
  budgetLakhs?: number;
}

export type AskFactKey = keyof AskFacts;
export const FACT_KEYS: AskFactKey[] = [
  'board',
  'boardMax',
  'boardMarks',
  'nataScores',
  'cutoff',
  'community',
  'state',
  'city',
  'examYear',
  'jeeRank',
  'keamRank',
  'budgetLakhs',
];

const num = (v: unknown, min: number, max: number): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : undefined;
};
const text = (v: unknown, max = 60): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.replace(/[\u0000-\u001f<>[\]{}]/g, '').trim();
  return t ? t.slice(0, max) : undefined;
};

/** Keeps only known keys with sensible values. Unknown or bad values are dropped. */
export function sanitizeFacts(raw: unknown): AskFacts {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: AskFacts = {};
  if (typeof r.board === 'string' && r.board in BOARD_CONFIG) out.board = r.board as BoardType;
  out.boardMax = num(r.boardMax, 1, 2000);
  out.boardMarks = num(r.boardMarks, 0, out.boardMax ?? 2000);
  if (Array.isArray(r.nataScores)) {
    const scores = r.nataScores.map((s) => num(s, 0, 200)).filter((s): s is number => s !== undefined);
    if (scores.length) out.nataScores = scores.slice(-3);
  }
  out.cutoff = num(r.cutoff, 0, 400);
  const community = text(r.community, 10)?.toUpperCase();
  if (community && (TNEA_COMMUNITIES as readonly string[]).includes(community)) out.community = community;
  out.state = text(r.state, 40);
  out.city = text(r.city, 40);
  out.examYear = num(r.examYear, 2024, 2035);
  out.jeeRank = num(r.jeeRank, 1, 2_000_000);
  out.keamRank = num(r.keamRank, 1, 200_000);
  out.budgetLakhs = num(r.budgetLakhs, 0, 100);
  for (const k of FACT_KEYS) if (out[k] === undefined) delete out[k];
  return out;
}

/**
 * Applies a change. A key set to null is forgotten; a key left out is kept.
 * The board's maximum follows a new board unless one was given with it.
 */
export function mergeFacts(current: AskFacts, patch: Record<string, unknown>): AskFacts {
  const next: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (!(FACT_KEYS as string[]).includes(k)) continue;
    if (v === null) delete next[k];
    else if (v !== undefined) next[k] = v;
  }
  if (typeof patch.board === 'string' && patch.board in BOARD_CONFIG && patch.boardMax == null) {
    next.boardMax = BOARD_CONFIG[patch.board as BoardType].maxMarks;
  }
  return sanitizeFacts(next);
}

export interface FactChip {
  /** The keys this chip forgets when removed. */
  keys: AskFactKey[];
  label: string;
}

/** The "Your details" strip, in a stable order. */
export function factChips(f: AskFacts): FactChip[] {
  const chips: FactChip[] = [];
  if (f.board || f.boardMarks != null) {
    const board = f.board ? BOARD_CONFIG[f.board].label.replace(/ Board$/, '') : '12th';
    const marks = f.boardMarks != null ? ` ${f.boardMarks}${f.boardMax ? `/${f.boardMax}` : ''}` : '';
    chips.push({ keys: ['board', 'boardMarks', 'boardMax'], label: `${board}${marks}` });
  }
  if (f.nataScores?.length) {
    const best = Math.max(...f.nataScores);
    chips.push({ keys: ['nataScores'], label: f.nataScores.length > 1 ? `NATA best ${best}` : `NATA ${best}` });
  }
  if (f.cutoff != null) chips.push({ keys: ['cutoff'], label: `Cutoff ${f.cutoff}/400` });
  if (f.community) chips.push({ keys: ['community'], label: f.community });
  if (f.city || f.state) chips.push({ keys: ['city', 'state'], label: [f.city, f.state].filter(Boolean).join(', ') });
  if (f.examYear) chips.push({ keys: ['examYear'], label: `NATA ${f.examYear}` });
  if (f.jeeRank) chips.push({ keys: ['jeeRank'], label: `JEE P2 rank ${f.jeeRank.toLocaleString('en-IN')}` });
  if (f.keamRank) chips.push({ keys: ['keamRank'], label: `KEAM rank ${f.keamRank.toLocaleString('en-IN')}` });
  if (f.budgetLakhs != null) chips.push({ keys: ['budgetLakhs'], label: `Budget ${f.budgetLakhs} lakh/yr` });
  return chips;
}

/** The facts as prompt lines. Empty when nothing is known. */
export function factsForPrompt(f: AskFacts): string {
  const lines: string[] = [];
  if (f.board) lines.push(`12th board: ${BOARD_CONFIG[f.board].label} (maximum ${f.boardMax ?? BOARD_CONFIG[f.board].maxMarks})`);
  if (f.boardMarks != null) lines.push(`12th marks: ${f.boardMarks}${f.boardMax ? ` out of ${f.boardMax}` : ''}`);
  if (f.nataScores?.length) lines.push(`NATA scores (out of 200): ${f.nataScores.join(', ')}`);
  if (f.cutoff != null) lines.push(`Cutoff already worked out: ${f.cutoff} out of 400`);
  if (f.community) lines.push(`TNEA community: ${f.community}`);
  if (f.city || f.state) lines.push(`Lives in: ${[f.city, f.state].filter(Boolean).join(', ')}`);
  if (f.examYear) lines.push(`Sits NATA in: ${f.examYear}`);
  if (f.jeeRank) lines.push(`JEE Main Paper 2 rank: ${f.jeeRank}`);
  if (f.keamRank) lines.push(`KEAM rank: ${f.keamRank}`);
  if (f.budgetLakhs != null) lines.push(`Fee budget: ${f.budgetLakhs} lakh a year`);
  return lines.length ? lines.map((l) => `- ${l}`).join('\n') : '';
}
