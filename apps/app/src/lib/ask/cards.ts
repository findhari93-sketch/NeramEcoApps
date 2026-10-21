/**
 * The cards Aintra (Tools app) shows with an answer. Every number on a card comes
 * from a tool (the cutoff formula, the allotment lists), never from the model:
 * the route builds the card from the tool result and streams it as its own
 * event, and the model only writes the sentences around it.
 *
 * Shared by the route (lib/ask/tools/*) and the chat (components/ask/cards/*).
 */

export type CounselingSystem = 'TNEA' | 'KEAM' | 'JOSAA';
export type Tier = 'safe' | 'target' | 'reach';

export interface CollegeRow {
  name: string;
  city: string | null;
  /** TNEA: closing mark out of 400. KEAM / JoSAA: closing rank. */
  closing: number;
  /** Which seat category the closing figure is for, e.g. "OC" or "BC". */
  category?: string;
  institutionType?: string | null;
}

export interface CutoffCardData {
  total: number;
  board200: number;
  nata: number;
  boardPercent: number;
  boardEligible: boolean;
  boardLabel: string;
  marks: number;
  boardMax: number;
  nataExplanation: string;
}

export interface CollegesCardData {
  system: CounselingSystem;
  year: number;
  /** "mark" for TNEA (out of 400), "rank" for KEAM and JoSAA. */
  basis: 'mark' | 'rank';
  studentValue: number;
  category: string;
  groups: Record<Tier, CollegeRow[]>;
  counts: Record<Tier, number>;
  /** Rows held back because the visitor is a guest. */
  hidden: number;
  source: string;
}

export interface RankCardData {
  system: 'TNEA' | 'KEAM';
  year: number;
  mark: number;
  bestRank: number;
  worstRank: number;
  totalRanked: number;
  bandFrom: number;
  bandTo: number;
  students: number;
}

export interface CentresCardData {
  place: string;
  year: number;
  centres: Array<{ label: string; km: number | null; inThisCity: boolean; venues: string[]; confirmed: boolean }>;
}

export interface CoaCardData {
  query: string;
  colleges: Array<{ name: string; city: string; intake: number | null; period: string | null }>;
  more: number;
}

export interface CostCardData {
  category: string;
  attempts: number;
  state: string | null;
  feePerAttempt: number;
  totalFee: number;
  travel: number;
  stay: number;
  materials: { min: number; max: number };
  totalMin: number;
  totalMax: number;
  feeYear: number;
}

export interface EligibilityCardData {
  purpose: string;
  nataEligible: boolean;
  barchEligible: boolean | null;
  conditions: Array<{ label: string; met: boolean; explanation: string }>;
}

export interface DatesCardData {
  cycleYear: number;
  scheduleYear: number;
  announced: boolean;
  phases: Array<{ phase: string; from: string; to: string; days: number }>;
  upcoming: Array<{ date: string; day: string; time: string; phase: string }>;
}

export interface ToolLinkCardData {
  title: string;
  description: string;
}

/**
 * A signed-in student's own things (account, fees, a ticket to send, the exam
 * year), from the account tools in lib/aintra/tools.ts. A fees card can hold an
 * enrolment-link token, so this card never reaches the model and is stored
 * redacted (see redactForStorage).
 */
export type AccountCardData = import('@/lib/aintra/cards').AintraCard;

export type AskCard =
  | { id: string; kind: 'cutoff'; data: CutoffCardData; href: string }
  | { id: string; kind: 'colleges'; data: CollegesCardData; href: string }
  | { id: string; kind: 'rank'; data: RankCardData; href: string }
  | { id: string; kind: 'centres'; data: CentresCardData; href: string }
  | { id: string; kind: 'coa'; data: CoaCardData; href: string }
  | { id: string; kind: 'cost'; data: CostCardData; href: string }
  | { id: string; kind: 'eligibility'; data: EligibilityCardData; href: string }
  | { id: string; kind: 'dates'; data: DatesCardData; href: string }
  | { id: string; kind: 'account'; data: AccountCardData; href: string }
  | { id: string; kind: 'tool'; data: ToolLinkCardData; href: string };

export type AskCardKind = AskCard['kind'];

const inr = (n: number) => n.toLocaleString('en-IN');

/**
 * What a student sends when they share a card (WhatsApp, the share sheet).
 * Written in their voice, ending in an invitation; the link follows it.
 */
export function shareTextFor(card: AskCard): string {
  switch (card.kind) {
    case 'cutoff':
      return `My B.Arch cutoff is ${card.data.total}/400 (12th ${card.data.board200}/200 + NATA ${card.data.nata}/200). Work out yours free on aiArchitek:`;
    case 'colleges': {
      const c = card.data.counts;
      const total = c.safe + c.target + c.reach;
      const basis = card.data.basis === 'mark' ? `${card.data.studentValue}/400` : `rank ${inr(card.data.studentValue)}`;
      return `${total} ${card.data.system === 'JOSAA' ? 'JoSAA' : card.data.system} B.Arch colleges matched ${basis} (${card.data.category}) in the official ${card.data.year} allotment. Check yours free on aiArchitek:`;
    }
    case 'cost':
      return `Sitting NATA will cost about ₹${inr(card.data.totalMin)} to ₹${inr(card.data.totalMax)}. Plan yours free on aiArchitek:`;
    default:
      return 'Free NATA and B.Arch admission tools on aiArchitek:';
  }
}

/** A short line describing a card, for the model and for plain-text copies. */
export function cardSummary(card: AskCard): string {
  switch (card.kind) {
    case 'cutoff':
      return `Cutoff ${card.data.total}/400 (board ${card.data.board200}/200 + NATA ${card.data.nata}/200), 12th ${card.data.boardPercent}%${card.data.boardEligible ? '' : ' (below 45%)'}`;
    case 'colleges': {
      const c = card.data.counts;
      return `${card.data.system} ${card.data.year}, ${card.data.category}: ${c.safe} safe, ${c.target} target, ${c.reach} reach`;
    }
    case 'rank':
      return `${card.data.system} ${card.data.year}: marks ${card.data.bandFrom} to ${card.data.bandTo} ranked ${card.data.bestRank} to ${card.data.worstRank} of ${card.data.totalRanked}`;
    case 'centres':
      return `NATA centres near ${card.data.place}: ${card.data.centres.map((c) => c.label).join(', ')}`;
    case 'coa':
      return `${card.data.colleges.length + card.data.more} COA approved colleges for "${card.data.query}"`;
    case 'cost':
      return `NATA cost, ${card.data.attempts} attempt(s): fee Rs ${card.data.totalFee}, total Rs ${card.data.totalMin} to ${card.data.totalMax}`;
    case 'eligibility':
      return `Eligibility: NATA ${card.data.nataEligible ? 'yes' : 'no'}${card.data.barchEligible === null ? '' : `, B.Arch ${card.data.barchEligible ? 'yes' : 'no'}`}`;
    case 'dates':
      return card.data.announced
        ? `NATA ${card.data.scheduleYear} next sessions: ${card.data.upcoming.map((u) => u.date).slice(0, 3).join(', ')}`
        : `NATA ${card.data.cycleYear} dates not announced; ${card.data.scheduleYear} pattern shown`;
    case 'account':
      return `Account card shown (${card.data.kind}); details are on the card, not repeated here`;
    case 'tool':
      return card.data.title;
  }
}

/** What is kept in ask_messages: an account card keeps only its type, never its links or figures. */
export function redactForStorage(cards: AskCard[]): unknown[] {
  return cards.map((c) => (c.kind === 'account' ? { id: c.id, kind: 'account', data: { kind: c.data.kind }, redacted: true } : c));
}
