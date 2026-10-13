/**
 * Written summaries of the NIRF Architecture table for /colleges/rankings/nirf.
 *
 * The page used to be a bare table, so Google had no headings or sentences to
 * match searches like "top 10 architecture colleges NIRF" or "which NIT is best
 * for architecture". Everything here is derived from the ranking rows, so the
 * copy and the FAQ answers update themselves when a new NIRF year is loaded.
 */
import type { PublicNIRFRow } from './nirf-client-filter';

export interface NIRFInsightItem {
  rank: number;
  name: string;
  shortName: string | null;
  city: string | null;
  state: string | null;
  score: number | null;
  slug: string | null;
}

export interface NIRFFaq {
  question: string;
  answer: string;
}

export interface NIRFInsights {
  year: number;
  previousYear: number | null;
  /** Highest rank NIRF published that year (40 in 2025), not the rows we hold. */
  rankedCount: number;
  ranked: NIRFInsightItem[];
  top10: NIRFInsightItem[];
  iits: NIRFInsightItem[];
  nits: NIRFInsightItem[];
  spas: NIRFInsightItem[];
  govtCount: number;
  /** Private and deemed universities together. */
  privateCount: number;
  topGovt: NIRFInsightItem | null;
  topPrivate: NIRFInsightItem | null;
  tamilNadu: NIRFInsightItem[];
  previousTop: NIRFInsightItem | null;
  faqs: NIRFFaq[];
}

const IIT = /^Indian Institute of Technology\b/i;
// Covers VNIT, MNIT and MANIT, whose names contain the phrase.
const NIT = /National Institute of Technology/i;
const SPA = /School of Planning and Architecture/i;

function toItem(r: PublicNIRFRow): NIRFInsightItem {
  return {
    rank: r.rank,
    name: r.college?.name ?? r.source_name,
    shortName: r.college?.short_name ?? null,
    city: r.college?.city ?? r.source_city,
    state: r.college?.state ?? r.source_state,
    score: r.score,
    slug: r.college?.slug ?? null,
  };
}

/** "IIT Roorkee" where a short name exists, else the full name. */
export function displayName(i: NIRFInsightItem): string {
  return i.shortName && i.shortName.length > 3 ? i.shortName : i.name;
}

export function placeLabel(i: NIRFInsightItem): string {
  return [i.city, i.state].filter(Boolean).join(', ');
}

function scoreText(score: number | null): string {
  return score === null ? '' : ` with a score of ${score.toFixed(2)}`;
}

/** "A, B and C" */
export function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function rankedNames(items: NIRFInsightItem[]): string {
  return joinList(items.map((i) => `${displayName(i)} (rank ${i.rank})`));
}

function rowsForYear(rows: readonly PublicNIRFRow[], year: number): NIRFInsightItem[] {
  return rows
    .filter((r) => r.year === year)
    .sort((a, b) => a.rank - b.rank)
    .map(toItem);
}

function typeOf(rows: readonly PublicNIRFRow[], year: number, rank: number): string {
  const r = rows.find((x) => x.year === year && x.rank === rank);
  return r?.college?.type?.toLowerCase() ?? '';
}

export function buildNIRFInsights(rows: readonly PublicNIRFRow[], years: readonly number[]): NIRFInsights | null {
  const sorted = [...years].sort((a, b) => b - a);
  const year = sorted[0];
  if (year === undefined) return null;
  const ranked = rowsForYear(rows, year);
  if (ranked.length === 0) return null;

  const previousYear = sorted[1] ?? null;
  const previousTop = previousYear === null ? null : rowsForYear(rows, previousYear)[0] ?? null;

  const isGovt = (i: NIRFInsightItem) => typeOf(rows, year, i.rank) === 'government';
  const isPrivate = (i: NIRFInsightItem) => ['private', 'deemed'].includes(typeOf(rows, year, i.rank));

  const govt = ranked.filter(isGovt);
  const priv = ranked.filter(isPrivate);
  const iits = ranked.filter((i) => IIT.test(i.name));
  const nits = ranked.filter((i) => NIT.test(i.name));
  const spas = ranked.filter((i) => SPA.test(i.name));
  const tamilNadu = ranked.filter((i) => i.state?.toLowerCase() === 'tamil nadu');

  const insights: NIRFInsights = {
    year,
    previousYear,
    rankedCount: Math.max(...ranked.map((i) => i.rank)),
    ranked,
    top10: ranked.filter((i) => i.rank <= 10),
    iits,
    nits,
    spas,
    govtCount: govt.length,
    privateCount: priv.length,
    topGovt: govt[0] ?? null,
    topPrivate: priv[0] ?? null,
    tamilNadu,
    previousTop,
    faqs: [],
  };
  insights.faqs = buildNIRFFaqs(insights);
  return insights;
}

export function buildNIRFFaqs(n: NIRFInsights): NIRFFaq[] {
  const faqs: NIRFFaq[] = [];
  const [first, second, third] = n.ranked;

  faqs.push({
    question: `Which is the No. 1 architecture college in India as per NIRF ${n.year}?`,
    answer:
      `${first.name} (${placeLabel(first)}) is ranked No. 1 in the NIRF ${n.year} Architecture and Planning ranking${scoreText(first.score)}.` +
      (second && third ? ` ${displayName(second)} is second and ${displayName(third)} is third.` : ''),
  });

  if (n.top10.length) {
    faqs.push({
      question: `What are the top 10 architecture colleges in India as per NIRF ${n.year}?`,
      answer: `The top 10 in NIRF ${n.year} Architecture and Planning are ${rankedNames(n.top10)}.`,
    });
  }

  if (n.nits.length) {
    const best = n.nits[0];
    const rest = n.nits.slice(1, 5);
    faqs.push({
      question: 'Which NIT is best for architecture?',
      answer:
        `${best.name} is the highest ranked NIT for architecture in NIRF ${n.year}, at rank ${best.rank}.` +
        (rest.length ? ` The next NITs are ${rankedNames(rest)}.` : '') +
        ' NITs admit B.Arch students through JEE Main Paper 2 and JoSAA counselling.',
    });
  }

  if (n.iits.length) {
    faqs.push({
      question: 'Which IIT is best for B.Arch?',
      answer:
        `In NIRF ${n.year} Architecture, the ranked IITs are ${rankedNames(n.iits)}.` +
        ' IITs admit B.Arch students through JEE Advanced followed by the Architecture Aptitude Test (AAT).',
    });
  }

  if (n.topGovt && n.topPrivate) {
    faqs.push({
      question: `Which is the best private architecture college in India as per NIRF ${n.year}?`,
      answer:
        `${n.topPrivate.name} (${placeLabel(n.topPrivate)}) is the highest ranked private or deemed university at rank ${n.topPrivate.rank}.` +
        ` Of the ranked institutions we list, ${n.govtCount} are government and ${n.privateCount} are private or deemed, and ${displayName(n.topGovt)} is the top government college.`,
    });
  }

  if (n.tamilNadu.length) {
    faqs.push({
      question: `Which are the best NIRF ranked architecture colleges in Tamil Nadu?`,
      answer: `${n.tamilNadu.length} Tamil Nadu institutions are ranked in NIRF ${n.year} Architecture: ${rankedNames(n.tamilNadu)}.`,
    });
  }

  faqs.push({
    question: `How many architecture colleges are ranked in NIRF ${n.year}?`,
    answer:
      `NIRF ${n.year} ranks ${n.rankedCount} institutions in the Architecture and Planning category, from ${displayName(first)} at No. 1 to rank ${n.rankedCount}.` +
      (n.ranked.length < n.rankedCount ? ` This page currently lists ${n.ranked.length} of them.` : ''),
  });

  if (n.previousTop && n.previousYear !== null) {
    const same = n.previousTop.name === first.name;
    faqs.push({
      question: `Which architecture college was No. 1 in NIRF ${n.previousYear}?`,
      answer: same
        ? `${n.previousTop.name} was No. 1 in NIRF ${n.previousYear} as well, so it has kept the top spot in ${n.year}.`
        : `${n.previousTop.name} was No. 1 in NIRF ${n.previousYear}. In ${n.year} the top spot went to ${displayName(first)}.`,
    });
  }

  faqs.push({
    question: 'How is the NIRF architecture ranking calculated?',
    answer:
      'NIRF scores each institution out of 100 on five parameters: Teaching, Learning and Resources (TLR), Research and Professional Practice (RPC), Graduation Outcomes (GO), Outreach and Inclusivity (OI) and Perception (PR). Institutions apply on their own, so a good college that did not apply will not appear in the list.',
  });

  faqs.push({
    question: 'Does NIRF rank affect B.Arch admission?',
    answer:
      'No. NIRF is a quality ranking, not an admission route. IITs admit through JEE Advanced and AAT, NITs and SPAs through JEE Main Paper 2 and JoSAA, and most state and private colleges through NATA scores.',
  });

  return faqs;
}

/** Page title and description, built from the latest year's leaders. */
export function nirfMeta(n: NIRFInsights | null): { title: string; description: string } {
  if (!n) {
    return {
      title: 'NIRF Architecture Rankings: Top B.Arch Colleges in India',
      description: 'NIRF Architecture and Planning rankings with scores, state filters and rank history for every ranked B.Arch college in India.',
    };
  }
  const [a, b, c] = n.ranked;
  const leaders = joinList([b, c].filter(Boolean).map(displayName));
  return {
    title: `NIRF Ranking ${n.year} Architecture Colleges: Top ${n.rankedCount} in India`,
    description:
      `${displayName(a)} is No. 1 in NIRF ${n.year} Architecture. See all ${n.rankedCount} ranked B.Arch colleges${leaders ? ` including ${leaders}` : ''}, with scores, state filters and rank history.`,
  };
}
