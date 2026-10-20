/**
 * The cards Ask aiArchitek shows with an answer. Every number on a card comes
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

export interface ToolLinkCardData {
  title: string;
  description: string;
}

export type AskCard =
  | { id: string; kind: 'cutoff'; data: CutoffCardData; href: string }
  | { id: string; kind: 'colleges'; data: CollegesCardData; href: string }
  | { id: string; kind: 'rank'; data: RankCardData; href: string }
  | { id: string; kind: 'centres'; data: CentresCardData; href: string }
  | { id: string; kind: 'coa'; data: CoaCardData; href: string }
  | { id: string; kind: 'tool'; data: ToolLinkCardData; href: string };

export type AskCardKind = AskCard['kind'];

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
    case 'tool':
      return card.data.title;
  }
}
