/**
 * The tools Ask aiArchitek can call. Each wraps code the public tool pages
 * already use (the cutoff formula, the day-cached allotment loaders, the
 * safe/target/reach bands), returns a compact result for the model to talk
 * about, and builds the card the student sees. Numbers on a card come from
 * here, never from the model.
 *
 * Data access goes through `deps`, so tests pass fixed rows and nothing here
 * touches the database directly.
 */
import { getCity, cityForName } from '@neram/geo';
import {
  BOARD_CONFIG,
  calculateBestNataScore,
  checkBoardEligibility,
  convertBoardMarks,
  cutoffPrefillQuery,
  type BoardType,
} from '@neram/tools-core/cutoff';
import type { Centre, CoaCollege, CutoffCollege, JosaaClosing, SystemRanks } from '@/lib/tools/data/facts';
import { bandForMark, nearestCentres } from '@/lib/tools/data/facts';
import { getToolSeo } from '@/lib/tools/tool-seo';
import { LIVE_TOOL_IDS, type ToolId } from '@/lib/tools/tool-ids';
import type { AskCard, CollegesCardData, CounselingSystem, Tier } from './cards';
import type { AskFacts } from './memory';
import { groupJosaa, groupKeam, groupTnea, limitGroups, TNEA_COMMUNITIES } from './tiers';

export interface AskToolDeps {
  loadCutoffColleges: () => Promise<CutoffCollege[]>;
  loadJosaaClosing: () => Promise<JosaaClosing[]>;
  loadRankBands: () => Promise<SystemRanks[]>;
  loadCentres: () => Promise<Centre[]>;
  loadCoaColleges: () => Promise<CoaCollege[]>;
}

/** The real loaders, imported only when a tool runs (they are server-only). */
export async function defaultAskToolDeps(): Promise<AskToolDeps> {
  const l = await import('@/lib/tools/data/loaders');
  return {
    loadCutoffColleges: l.loadCutoffColleges,
    loadJosaaClosing: l.loadJosaaClosing,
    loadRankBands: l.loadRankBands,
    loadCentres: l.loadCentres,
    loadCoaColleges: l.loadCoaColleges,
  };
}

export interface AskToolContext {
  guest: boolean;
  facts: AskFacts;
}

export interface AskToolOutcome {
  ok: boolean;
  /** What the model reads. Small: counts and a few names, not whole tables. */
  result: Record<string, unknown>;
  card?: AskCard;
  /** Details learned from this call, merged into memory by the route. */
  factsPatch?: Record<string, unknown>;
}

let cardSeq = 0;
const cardId = (kind: string) => `${kind}-${Date.now().toString(36)}-${(cardSeq++).toString(36)}`;

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

// ─── Declarations (Gemini function calling) ───────────────────────────────

export const ASK_TOOL_DECLARATIONS = [
  {
    name: 'calculate_cutoff',
    description:
      'Work out the B.Arch cutoff out of 400: 12th marks converted to 200 plus the best NATA score out of 200. Call this whenever the student gives marks or asks for their cutoff. Leave out anything the student has not said; remembered details fill the gaps.',
    parameters: {
      type: 'object',
      properties: {
        board: {
          type: 'string',
          enum: Object.keys(BOARD_CONFIG),
          description: 'The 12th board. TN_STATE for Tamil Nadu State Board, KERALA_HSE for Kerala, CBSE, ICSE and so on.',
        },
        board_marks: { type: 'number', description: 'Marks scored in 12th (the total the board counts).' },
        board_max: { type: 'number', description: 'Maximum marks, only if the student says it differs from the board usual.' },
        board_percent: { type: 'number', description: 'Use instead of marks when the student only gives a percentage.' },
        nata_scores: {
          type: 'array',
          items: { type: 'number' },
          description: 'NATA totals out of 200, one per attempt. The best counts.',
        },
        nata_part_a: { type: 'number', description: 'NATA Part A (drawing, out of 80), when given separately.' },
        nata_part_b: { type: 'number', description: 'NATA Part B (MCQ, out of 120), when given separately.' },
      },
    },
  },
  {
    name: 'predict_colleges',
    description:
      'Colleges the student could get, from last year’s official allotments, grouped safe / target / reach. TNEA (Tamil Nadu) uses the cutoff out of 400 and the community; KEAM (Kerala) and JOSAA (IITs, NITs, SPAs) use a rank. Call calculate_cutoff first if the cutoff is not known.',
    parameters: {
      type: 'object',
      properties: {
        system: { type: 'string', enum: ['TNEA', 'KEAM', 'JOSAA'] },
        cutoff: { type: 'number', description: 'Cutoff out of 400 (TNEA, or KEAM when no rank is known).' },
        community: { type: 'string', enum: [...TNEA_COMMUNITIES], description: 'TNEA community. OC if not said.' },
        rank: { type: 'number', description: 'KEAM rank, or JEE Main Paper 2 rank for JOSAA.' },
      },
      required: ['system'],
    },
  },
  {
    name: 'predict_rank',
    description: 'The counselling rank range students with this cutoff got last year, from the official TNEA or KEAM rank list.',
    parameters: {
      type: 'object',
      properties: {
        system: { type: 'string', enum: ['TNEA', 'KEAM'] },
        cutoff: { type: 'number', description: 'Cutoff out of 400.' },
      },
      required: ['system'],
    },
  },
  {
    name: 'find_exam_centres',
    description: 'The NATA test cities nearest a city in India, with distance in km and known venues.',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City or town name, e.g. "Madurai".' },
        state: { type: 'string', description: 'State name, if the student said it.' },
      },
      required: ['city'],
    },
  },
  {
    name: 'check_coa_approval',
    description: 'Whether a college is on the Council of Architecture approved list, or the approved colleges in a city. Search by college name or city.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'College name or city.' } },
      required: ['query'],
    },
  },
  {
    name: 'save_my_details',
    description:
      'Remember details the student tells you (community, city, state, exam year, JEE or KEAM rank, fee budget) so later answers use them. Marks and NATA scores are remembered by calculate_cutoff; do not repeat them here.',
    parameters: {
      type: 'object',
      properties: {
        community: { type: 'string', enum: [...TNEA_COMMUNITIES] },
        city: { type: 'string' },
        state: { type: 'string' },
        exam_year: { type: 'number' },
        jee_rank: { type: 'number' },
        keam_rank: { type: 'number' },
        budget_lakhs: { type: 'number', description: 'Yearly fee budget in lakh rupees.' },
      },
    },
  },
  {
    name: 'open_tool',
    description:
      'Show a link card to one of the aiArchitek tools when it answers the question better than chat (exam planner, cost calculator, image crop for the NATA photo, question bank, eligibility checker, insights).',
    parameters: {
      type: 'object',
      properties: { tool: { type: 'string', enum: [...LIVE_TOOL_IDS] } },
      required: ['tool'],
    },
  },
];

/** What the student sees while a tool runs. */
export const ASK_TOOL_STATUS: Record<string, string> = {
  calculate_cutoff: 'Working out your cutoff',
  predict_colleges: 'Checking last year’s allotments',
  predict_rank: 'Reading the rank list',
  find_exam_centres: 'Finding test cities near you',
  check_coa_approval: 'Checking the COA approved list',
  save_my_details: 'Noting that down',
  open_tool: 'Finding the right tool',
};

export function askToolStatus(names: string[]): string {
  return `${names.map((n) => ASK_TOOL_STATUS[n]).find(Boolean) ?? 'Looking that up'}...`;
}

// ─── Tools ────────────────────────────────────────────────────────────────

function calculateCutoff(args: Record<string, unknown>, ctx: AskToolContext): AskToolOutcome {
  const f = ctx.facts;
  const board = (typeof args.board === 'string' && args.board in BOARD_CONFIG ? args.board : f.board) as BoardType | undefined;
  const boardMax = num(args.board_max) ?? (args.board ? undefined : f.boardMax) ?? (board ? BOARD_CONFIG[board].maxMarks : undefined);
  let marks = num(args.board_marks) ?? (args.board_percent == null ? f.boardMarks : undefined);
  const pct = num(args.board_percent);
  if (marks == null && pct != null && pct >= 0 && pct <= 100 && boardMax) marks = Math.round(((pct / 100) * boardMax) * 100) / 100;

  const partA = num(args.nata_part_a);
  const partB = num(args.nata_part_b);
  let scores = Array.isArray(args.nata_scores) ? (args.nata_scores.map(num).filter((s) => s != null) as number[]) : [];
  if (scores.length === 0 && (partA != null || partB != null)) scores = [(partA ?? 0) + (partB ?? 0)];
  if (scores.length === 0 && f.nataScores?.length) scores = f.nataScores;

  const missing: string[] = [];
  if (!boardMax) missing.push('12th board or maximum marks');
  if (marks == null) missing.push('12th marks');
  if (scores.length === 0) missing.push('NATA score');
  if (missing.length) return { ok: false, result: { error: 'missing_input', ask_for: missing } };
  if (marks! > boardMax! || marks! < 0) return { ok: false, result: { error: 'marks_out_of_range', board_max: boardMax } };
  if (scores.some((s) => s < 0 || s > 200)) return { ok: false, result: { error: 'nata_out_of_range', note: 'NATA is out of 200' } };

  const best = calculateBestNataScore(
    scores.map((s) => ({ partA: String(s), partB: '0' })),
    false,
    0
  );
  const board200 = convertBoardMarks(marks!, boardMax!);
  const total = Math.round((board200 + best.bestScore) * 100) / 100;
  const boardPercent = Math.round((marks! / boardMax!) * 1000) / 10;
  const boardEligible = checkBoardEligibility(marks!, boardMax!);
  const boardLabel = board ? BOARD_CONFIG[board].label : '12th';

  const query = cutoffPrefillQuery({
    board,
    maxMarks: boardMax,
    marksSecured: marks,
    ...(scores.length === 1 && partA != null && partB != null ? { partA, partB } : {}),
  });
  return {
    ok: true,
    result: {
      cutoff_out_of_400: total,
      board_out_of_200: board200,
      nata_out_of_200: best.bestScore,
      board_percent: boardPercent,
      meets_45_percent_rule: boardEligible,
      nata_note: scores.length > 1 ? 'best of the attempts counted' : undefined,
    },
    card: {
      id: cardId('cutoff'),
      kind: 'cutoff',
      href: `/tools/nata/cutoff-calculator${query ? `?${query}` : ''}`,
      data: {
        total,
        board200,
        nata: best.bestScore,
        boardPercent,
        boardEligible,
        boardLabel,
        marks: marks!,
        boardMax: boardMax!,
        nataExplanation: scores.length > 1 ? `Best of ${scores.length} attempts: ${scores.join(', ')}` : 'One attempt',
      },
    },
    factsPatch: { board: board ?? null, boardMax, boardMarks: marks, nataScores: scores, cutoff: total },
  };
}

function rankFromBands(ranks: SystemRanks | undefined, mark: number) {
  if (!ranks) return null;
  const band = bandForMark(ranks.bands, mark);
  if (!band) return null;
  return { band, mid: Math.round((band.bestRank + band.worstRank) / 2) };
}

async function predictColleges(args: Record<string, unknown>, ctx: AskToolContext, deps: AskToolDeps): Promise<AskToolOutcome> {
  const system = String(args.system ?? '').toUpperCase() as CounselingSystem;
  const f = ctx.facts;
  let groups;
  let year = 0;
  let basis: 'mark' | 'rank' = 'rank';
  let studentValue = 0;
  let category = '';
  let source = '';
  let href = '/tools/counseling/college-predictor';
  let estimatedRank: { from: number; to: number } | undefined;

  if (system === 'TNEA') {
    const cutoff = num(args.cutoff) ?? f.cutoff;
    if (cutoff == null) return { ok: false, result: { error: 'missing_input', ask_for: ['cutoff out of 400 (or 12th marks and NATA score)'] } };
    const community = typeof args.community === 'string' && (TNEA_COMMUNITIES as readonly string[]).includes(args.community) ? args.community : f.community ?? 'OC';
    const colleges = (await deps.loadCutoffColleges()).filter((c) => c.system === 'TNEA_BARCH');
    if (colleges.length === 0) return { ok: false, result: { error: 'no_data' } };
    year = colleges[0].year;
    groups = groupTnea(colleges, cutoff, community);
    basis = 'mark';
    studentValue = cutoff;
    category = community;
    source = `TNEA B.Arch ${year} allotment list`;
    href = `/tools/counseling/college-predictor?score=${cutoff}&system=TNEA_BARCH&category=${community}`;
  } else if (system === 'KEAM') {
    let rank = num(args.rank) ?? f.keamRank;
    const cutoff = num(args.cutoff) ?? f.cutoff;
    if (rank == null && cutoff != null) {
      const est = rankFromBands((await deps.loadRankBands()).find((r) => r.code === 'KEAM_BARCH'), cutoff);
      if (est) {
        rank = est.mid;
        estimatedRank = { from: est.band.bestRank, to: est.band.worstRank };
      }
    }
    if (rank == null) return { ok: false, result: { error: 'missing_input', ask_for: ['KEAM rank, or a cutoff out of 400'] } };
    const colleges = (await deps.loadCutoffColleges()).filter((c) => c.system === 'KEAM_BARCH');
    if (colleges.length === 0) return { ok: false, result: { error: 'no_data' } };
    year = colleges[0].year;
    groups = groupKeam(colleges, rank);
    studentValue = rank;
    category = 'State Merit';
    source = `KEAM B.Arch ${year} closing ranks, last phase`;
    href = `/tools/counseling/college-predictor?system=KEAM_BARCH${cutoff != null ? `&score=${cutoff}` : ''}`;
  } else if (system === 'JOSAA') {
    const rank = num(args.rank) ?? f.jeeRank;
    if (rank == null) return { ok: false, result: { error: 'missing_input', ask_for: ['JEE Main Paper 2 (B.Arch) rank'] } };
    const rows = await deps.loadJosaaClosing();
    if (rows.length === 0) return { ok: false, result: { error: 'no_data' } };
    year = rows[0].year;
    groups = groupJosaa(rows, rank);
    studentValue = rank;
    category = 'Open, gender-neutral';
    source = `JoSAA ${year} round ${rows[0].round} closing ranks`;
    href = '/tools/counseling/josaa-predictor';
  } else {
    return { ok: false, result: { error: 'unknown_system', systems: ['TNEA', 'KEAM', 'JOSAA'] } };
  }

  const limited = limitGroups(groups, ctx.guest);
  const data: CollegesCardData = {
    system,
    year,
    basis,
    studentValue,
    category,
    groups: limited.groups,
    counts: limited.counts,
    hidden: limited.hidden,
    source,
  };
  const names = (t: Tier) => groups[t].slice(0, 3).map((r) => `${r.name} (${r.closing})`);
  return {
    ok: true,
    result: {
      source,
      category,
      [basis === 'mark' ? 'student_cutoff' : 'student_rank']: studentValue,
      rank_estimated_from_cutoff: estimatedRank,
      counts: limited.counts,
      top_safe: names('safe'),
      top_target: names('target'),
      top_reach: names('reach'),
      guest_sees_only_some: ctx.guest && limited.hidden > 0 ? limited.hidden : undefined,
    },
    card: { id: cardId('colleges'), kind: 'colleges', href, data },
    factsPatch: system === 'TNEA' ? { community: category } : undefined,
  };
}

async function predictRank(args: Record<string, unknown>, ctx: AskToolContext, deps: AskToolDeps): Promise<AskToolOutcome> {
  const system = String(args.system ?? '').toUpperCase() === 'KEAM' ? 'KEAM' : 'TNEA';
  const cutoff = num(args.cutoff) ?? ctx.facts.cutoff;
  if (cutoff == null) return { ok: false, result: { error: 'missing_input', ask_for: ['cutoff out of 400'] } };
  const ranks = (await deps.loadRankBands()).find((r) => r.code === `${system}_BARCH`);
  const est = rankFromBands(ranks, cutoff);
  if (!ranks || !est) return { ok: false, result: { error: 'no_data' } };
  return {
    ok: true,
    result: {
      source: `${system} B.Arch ${ranks.year} rank list`,
      marks_band: `${est.band.from} to ${est.band.to}`,
      ranks: `${est.band.bestRank} to ${est.band.worstRank}`,
      students_ranked: ranks.total,
    },
    card: {
      id: cardId('rank'),
      kind: 'rank',
      href: `/tools/counseling/rank-predictor?score=${cutoff}&system=${system}_BARCH`,
      data: {
        system,
        year: ranks.year,
        mark: cutoff,
        bestRank: est.band.bestRank,
        worstRank: est.band.worstRank,
        totalRanked: ranks.total,
        bandFrom: est.band.from,
        bandTo: est.band.to,
        students: est.band.count,
      },
    },
  };
}

async function findExamCentres(args: Record<string, unknown>, _ctx: AskToolContext, deps: AskToolDeps): Promise<AskToolOutcome> {
  const name = typeof args.city === 'string' ? args.city : '';
  const stateName = typeof args.state === 'string' ? args.state : null;
  const stateSlug = stateName ? stateName.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : null;
  const slug = cityForName(name, stateSlug);
  const city = slug ? getCity(slug) : undefined;
  if (!city || !('lat' in city)) return { ok: false, result: { error: 'unknown_city', city: name } };
  const near = nearestCentres({ slug: city.slug, lat: city.lat, lng: city.lng }, await deps.loadCentres(), 3);
  if (near.length === 0) return { ok: false, result: { error: 'no_data' } };
  const year = near[0].centre.year;
  return {
    ok: true,
    result: { city: city.name, nearest: near.map((n) => `${n.centre.label}${n.inThisCity ? ' (in this city)' : ` (${n.km} km)`}`), year },
    card: {
      id: cardId('centres'),
      kind: 'centres',
      href: `/tools/nata/exam-centers`,
      data: {
        place: city.name,
        year,
        centres: near.map((n) => ({ label: n.centre.label, km: n.km, inThisCity: n.inThisCity, venues: n.centre.venues.slice(0, 2), confirmed: n.centre.confirmed })),
      },
    },
    factsPatch: { city: city.name },
  };
}

async function checkCoa(args: Record<string, unknown>, ctx: AskToolContext, deps: AskToolDeps): Promise<AskToolOutcome> {
  const q = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
  if (q.length < 3) return { ok: false, result: { error: 'query_too_short' } };
  const words = q.split(/\s+/).filter((w) => w.length > 2 && !['college', 'architecture', 'of', 'school', 'the', 'and'].includes(w));
  const all = await deps.loadCoaColleges();
  const hits = all.filter((c) => {
    const hay = `${c.name} ${c.city}`.toLowerCase();
    return words.length > 0 ? words.every((w) => hay.includes(w)) : hay.includes(q);
  });
  const cap = ctx.guest ? 3 : 8;
  return {
    ok: true,
    result: {
      matches: hits.length,
      approved: hits.slice(0, 5).map((c) => `${c.name}, ${c.city}${c.intake ? `, intake ${c.intake}` : ''}`),
      note: hits.length === 0 ? 'Not found on the COA approved list by that name. Ask for the exact name or the city.' : undefined,
    },
    card: {
      id: cardId('coa'),
      kind: 'coa',
      href: '/tools/counseling/coa-checker',
      data: {
        query: String(args.query),
        colleges: hits.slice(0, cap).map((c) => ({ name: c.name, city: c.city, intake: c.intake, period: c.period })),
        more: Math.max(0, hits.length - cap),
      },
    },
  };
}

function saveMyDetails(args: Record<string, unknown>): AskToolOutcome {
  const patch: Record<string, unknown> = {};
  if (args.community != null) patch.community = args.community;
  if (args.city != null) patch.city = args.city;
  if (args.state != null) patch.state = args.state;
  if (args.exam_year != null) patch.examYear = args.exam_year;
  if (args.jee_rank != null) patch.jeeRank = args.jee_rank;
  if (args.keam_rank != null) patch.keamRank = args.keam_rank;
  if (args.budget_lakhs != null) patch.budgetLakhs = args.budget_lakhs;
  return { ok: true, result: { saved: Object.keys(patch) }, factsPatch: patch };
}

function openTool(args: Record<string, unknown>): AskToolOutcome {
  const id = String(args.tool) as ToolId;
  if (!(LIVE_TOOL_IDS as readonly string[]).includes(id)) return { ok: false, result: { error: 'unknown_tool' } };
  const seo = getToolSeo(id);
  return {
    ok: true,
    result: { shown: seo.name },
    card: { id: cardId('tool'), kind: 'tool', href: seo.path, data: { title: seo.name, description: seo.answer } },
  };
}

export async function runAskTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AskToolContext,
  deps: AskToolDeps
): Promise<AskToolOutcome> {
  try {
    switch (name) {
      case 'calculate_cutoff':
        return calculateCutoff(args, ctx);
      case 'predict_colleges':
        return await predictColleges(args, ctx, deps);
      case 'predict_rank':
        return await predictRank(args, ctx, deps);
      case 'find_exam_centres':
        return await findExamCentres(args, ctx, deps);
      case 'check_coa_approval':
        return await checkCoa(args, ctx, deps);
      case 'save_my_details':
        return saveMyDetails(args);
      case 'open_tool':
        return openTool(args);
      default:
        return { ok: false, result: { error: 'unknown_tool' } };
    }
  } catch (err) {
    console.error('[ask] tool failed', name, err instanceof Error ? err.message : err);
    return { ok: false, result: { error: 'tool_failed' } };
  }
}
