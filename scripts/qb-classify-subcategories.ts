/**
 * QB Sub-Category Classification Script
 *
 * Adds detailed sub-categories to JEE Paper 2 questions that only have broad
 * categories (mathematics, aptitude, drawing, planning).
 *
 * - Aptitude questions: keyword-based classification (zero API cost)
 * - Math questions: Claude Haiku API classification
 * - Planning questions: Claude Haiku API classification
 * - Drawing questions: skipped (no meaningful sub-categories)
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... SUPABASE_SERVICE_ROLE_KEY=... npx tsx qb-classify-subcategories.ts --dry-run
 *   ANTHROPIC_API_KEY=sk-... SUPABASE_SERVICE_ROLE_KEY=... npx tsx qb-classify-subcategories.ts --apply
 *   ANTHROPIC_API_KEY=sk-... SUPABASE_SERVICE_ROLE_KEY=... npx tsx qb-classify-subcategories.ts --paper <id> --dry-run
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// ── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://db.neramclasses.com';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

const BATCH_SIZE = 10; // Concurrent API calls

// Target papers (papers with only broad categories)
const TARGET_PAPER_IDS = [
  '85185003-00ca-45fe-b6dc-1d49a5a700b8', // 2013
  'c3119ebb-a9b1-4dbe-943a-22428de8863a', // 2016
  '7764129f-5826-42ce-b4f0-6399e83607b7', // 2017
  'e5ed29b0-621c-4454-a4ff-b481190fed32', // 2019 S1 afternoon
  '892df095-b914-437c-ae6c-5dfb08816c96', // 2019 S1 forenoon
  'e0e0d73c-215a-4798-b379-817c689edbe8', // 2019 S2 afternoon
  '03e4c4ef-1136-47e0-8ba4-2a8fe8f06f60', // 2020 S1 afternoon
  'd62b61c7-6e8b-4b76-bfac-da99dd5fd257', // 2020 S1 forenoon
  '4b6efd72-79c5-4fbd-b761-c2b67ddfbd33', // 2021 S1 afternoon
  '7c47e9a4-e32e-4344-b765-c14a7606e634', // 2022 S2 forenoon
  '5ec3b352-7468-40d2-8edc-aeeadd4570b9', // 2026
];

// Valid QBCategory sub-categories
const MATH_SUBCATEGORIES = [
  'trigonometry',
  'probability',
  'statistics',
  'matrices',
  'determinants',
  'complex_numbers',
  'vectors',
  '3d_geometry',
  'conic_sections',
  'circles',
  'straight_lines',
  'sequences_and_series',
  'binomial_theorem',
  'permutations_combinations',
  'definite_integrals',
  'indefinite_integrals',
  'differential_equations',
  'applications_of_derivatives',
  'differentiability',
  'continuity',
  'mean_value_theorems',
  'quadratic_equations',
  'functions',
  'sets_and_relations',
  'mathematical_logic',
] as const;

const APTITUDE_SUBCATEGORIES = [
  'spatial_visualization',
  'orthographic_projection',
  'pattern_recognition',
  'analogy',
  'counting_figures',
  'odd_one_out',
  'surface_counting',
  'mirror_image',
  'embedded_figure',
  'architecture_gk',
  'building_science',
  'building_materials',
  'building_services',
  'design_fundamentals',
] as const;

const PLANNING_SUBCATEGORIES = [
  'sustainability',
  'general_knowledge',
  'architecture_gk',
  'current_affairs',
  'famous_architects',
  'building_materials',
  'building_services',
  'building_science',
  'design_fundamentals',
  'history_of_architecture',
  'planning',
] as const;

// ── Parse CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const apply = args.includes('--apply');
const paperIdx = args.indexOf('--paper');
const singlePaperId = paperIdx !== -1 ? args[paperIdx + 1] : null;

if (!dryRun && !apply) {
  console.log('Usage: npx tsx qb-classify-subcategories.ts [--dry-run | --apply] [--paper <id>]');
  console.log('  --dry-run    Preview classifications without writing to DB');
  console.log('  --apply      Write classifications to production DB');
  console.log('  --paper <id> Process only a single paper');
  process.exit(0);
}

// ── Clients ─────────────────────────────────────────────────────────────────
function getClients() {
  if (!SUPABASE_SERVICE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY env var is required.');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Anthropic client only needed if we have math/planning questions
  let anthropic: Anthropic | null = null;
  if (ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  }

  return { supabase, anthropic };
}

// ── Aptitude keyword classifier ─────────────────────────────────────────────
function classifyAptitudeByKeyword(text: string): string | null {
  const t = text.toLowerCase();

  // Visual reasoning (most reliable patterns, ordered by specificity)
  if (
    /top view|front view|side view|elevation|direction of.*arrow|looking in the direction|plan and elevation/i.test(
      text
    )
  )
    return 'orthographic_projection';

  if (/number of surfaces|total.*surfaces|count.*surfaces/i.test(text))
    return 'surface_counting';

  if (/odd figure out|odd one out|odd man out/i.test(text))
    return 'odd_one_out';

  if (
    /hidden.*(?:problem|answer)\s*figure|(?:problem|answer)\s*figure.*hidden/i.test(
      text
    )
  )
    return 'embedded_figure';

  if (/mirror image|water image/i.test(text)) return 'mirror_image';

  if (
    /complete the sequence|complete.*sequence|sequence.*problem figures|what comes next/i.test(
      text
    )
  )
    return 'pattern_recognition';

  if (/opened up|figure is opened|unfold/i.test(text))
    return 'spatial_visualization';

  if (
    /number of (?:rectangles|triangles|parallelogram|squares|lines|straight lines)/i.test(
      text
    )
  )
    return 'counting_figures';

  if (/analogy|analogous|is to.*as.*is to/i.test(text)) return 'analogy';

  // 3D spatial visualization
  if (
    /3-?d.*view|3-?d.*figure.*correct|re-?joining|split into|folded|which solid/i.test(
      text
    )
  )
    return 'spatial_visualization';

  // Building science keywords
  if (
    /sound absorb|insulation|thermal|sun ?shade|heat.*gain|cooling|ventilation|load.*member|beam|lintel|structural|RCC|rcc|reinforced|cantilever|stress|compressive|tensile|humidity|acoust|decibel|illumin|lux|daylight|orientation.*building|sun.*path|solar|wind.*direction|natural light|shadowless light/i.test(
      text
    )
  )
    return 'building_science';

  // Building materials
  if (
    /clad(?:ded|ding)?|brick|marble|concrete|timber|steel\b|glass\b|cement|mortar|material.*(?:wall|construction|building)|sand\s*stone|granite|stone.*type|ferro\s*cement|plywood|laminated|asbestos|gypsum|lime\b/i.test(
      text
    )
  )
    return 'building_materials';

  // Building services
  if (
    /electricity|watt|energy.*consumption|consumes? least|power.*consumption|plumbing|drainage|sewage|water supply|fire.*escape|fire.*safety|lift|elevator|escalator|air.?condition|hvac/i.test(
      text
    )
  )
    return 'building_services';

  // Design fundamentals
  if (
    /sector plan|town plan|city.*plan|urban.*design|grid.*pattern|zoning|master plan|layout.*plan|neighbourhood|garden city|radburn|le corbusier.*plan|chandigarh.*plan/i.test(
      text
    )
  )
    return 'design_fundamentals';

  // Color/design theory
  if (
    /colour|color.*mix|warm.*col|cool.*col|primary.*col|secondary.*col|shade.*tint|hue|complementary.*col|analogous.*col|monochromat/i.test(
      text
    )
  )
    return 'design_fundamentals';

  // Famous architects
  if (
    /designed by|architect.*designed|pritzker|le corbusier|frank lloyd wright|zaha hadid|charles correa|laurie baker|b\.?v\.? doshi|louis kahn|mies van der rohe|tadao ando|renzo piano|norman foster|rem koolhaas|which.*architect/i.test(
      text
    )
  )
    return 'architecture_gk';

  // Architecture/place GK
  if (
    /located in|situated|mahal\b|minar\b|fort\b|palace|temple|cathedral|mosque|church|monument|heritage|unesco|cave|stupa|pagoda|dome|minaret|basilica|pyramid|colosseum|acropolis|parthenon/i.test(
      text
    )
  )
    return 'architecture_gk';

  // General architecture GK
  if (
    /tallest|longest|largest|first.*in india|capital of|state.*india|mughal|gothic|roman.*architecture|renaissance|baroque|art deco|art nouveau|brutalism|deconstructiv/i.test(
      text
    )
  )
    return 'architecture_gk';

  // Climate/geography related to buildings
  if (
    /cold.*dry|hot.*humid|warm.*humid|composite.*climate|climate.*zone|region.*india.*climate|which.*roof|roof.*cooler|sloping roof|flat roof/i.test(
      text
    )
  )
    return 'building_science';

  // Canal/transportation/city planning GK
  if (
    /canal|transportation.*channel|river.*city|port.*city|coastal.*city/i.test(
      text
    )
  )
    return 'architecture_gk';

  // Match patterns
  if (/match.*list|match.*column|match.*pair|match.*following/i.test(text))
    return 'architecture_gk';

  // Broad "which of the following" with building/architecture context
  if (
    /horizontal member|vertical member|structural element|foundation|footing|truss|arch\b.*type|vault|buttress/i.test(
      text
    )
  )
    return 'building_science';

  return null; // fallback to Claude API
}

// ── Math Claude API classifier ──────────────────────────────────────────────
const MATH_SYSTEM_PROMPT = `You are a JEE Paper 2 (B.Arch) mathematics question classifier. Given a math question, classify it into exactly ONE subcategory from the list below.

Valid subcategories:
- trigonometry: trigonometric functions, inverse trig, identities, heights and distances
- probability: probability of events, P(A), Bayes theorem, conditional probability
- statistics: mean, variance, standard deviation, correlation, regression
- matrices: matrix operations, inverse, transpose, A^T, rank
- determinants: determinant evaluation, Cramer's rule, system of linear equations via determinants
- complex_numbers: z, i, |z|, arg(z), complex plane, De Moivre's theorem
- vectors: dot product, cross product, scalar triple product, vector operations
- 3d_geometry: lines and planes in 3D space, direction cosines, shortest distance between lines
- conic_sections: parabola, ellipse, hyperbola (NOT circles)
- circles: circle equation, tangent to circle, chord, radical axis
- straight_lines: slope, intercept, line equations in 2D, angle between lines
- sequences_and_series: AP, GP, HP, sum of series, nth term
- binomial_theorem: binomial expansion, general term, binomial coefficients
- permutations_combinations: nCr, nPr, counting principles, arrangements
- definite_integrals: integrals with specific limits, area under curves
- indefinite_integrals: antiderivatives, integration techniques (no limits)
- differential_equations: dy/dx equations, general/particular solutions, order and degree
- applications_of_derivatives: rate of change, tangent/normal, maxima/minima, curve sketching, monotonicity
- differentiability: checking differentiability, piecewise functions differentiability
- continuity: limits, checking continuity, L'Hopital's rule, limit evaluation
- mean_value_theorems: Rolle's theorem, Lagrange's mean value theorem
- quadratic_equations: ax^2+bx+c=0, roots, discriminant, nature of roots
- functions: domain, range, composition, injective/surjective, inverse functions
- sets_and_relations: set operations, equivalence relations, number of relations
- mathematical_logic: tautology, contradiction, logical connectives, truth tables

IMPORTANT: Return ONLY the subcategory name as a single word/phrase. No explanation, no JSON, no markdown. Just the subcategory.

Example:
Question: "If z = 2+3i, find |z|^2"
Answer: complex_numbers`;

async function classifyMathQuestion(
  anthropic: Anthropic,
  questionText: string
): Promise<string | null> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      system: MATH_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Classify this JEE Paper 2 math question:\n\n${questionText.slice(0, 800)}`,
        },
      ],
    });

    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return null;

    const result = text.text.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

    // Validate against known subcategories
    if ((MATH_SUBCATEGORIES as readonly string[]).includes(result)) {
      return result;
    }

    // Try fuzzy match for common variations
    const fuzzyMap: Record<string, string> = {
      limits: 'continuity',
      limit: 'continuity',
      integration: 'indefinite_integrals',
      derivative: 'applications_of_derivatives',
      derivatives: 'applications_of_derivatives',
      matrix: 'matrices',
      determinant: 'determinants',
      vector: 'vectors',
      circle: 'circles',
      parabola: 'conic_sections',
      ellipse: 'conic_sections',
      hyperbola: 'conic_sections',
      line: 'straight_lines',
      lines: 'straight_lines',
      complex: 'complex_numbers',
      sets: 'sets_and_relations',
      logic: 'mathematical_logic',
      sequence: 'sequences_and_series',
      series: 'sequences_and_series',
      binomial: 'binomial_theorem',
      permutation: 'permutations_combinations',
      combination: 'permutations_combinations',
      area_under_curves: 'definite_integrals',
    };

    if (fuzzyMap[result]) return fuzzyMap[result];

    console.warn(`  Warning: unrecognized math subcategory "${result}" for question starting with "${questionText.slice(0, 60)}..."`);
    return null;
  } catch (err) {
    console.error(
      `  Classification failed:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

// ── Planning/GK Claude API classifier ───────────────────────────────────────
const PLANNING_SYSTEM_PROMPT = `You are classifying general knowledge and planning questions from JEE Paper 2 (B.Arch) exam. These questions test knowledge of architecture, urban planning, sustainability, and general awareness.

Given a question, classify it into exactly ONE subcategory:

- architecture_gk: famous buildings, architects, architectural styles, monuments, cities
- building_science: structural elements, climate, orientation, thermal comfort, acoustics, lighting
- building_materials: construction materials, properties of materials
- building_services: plumbing, electrical, HVAC, fire safety, elevators
- sustainability: green building, energy efficiency, environment, ecology, renewable energy
- general_knowledge: geography, history (non-architectural), sports, science, current affairs
- current_affairs: recent events, government schemes, contemporary issues
- famous_architects: questions specifically about identifying or matching architects
- history_of_architecture: architectural history, periods, movements
- design_fundamentals: urban planning, zoning, layout, city planning, design principles
- planning: urban and regional planning, master plans, land use

Return ONLY the subcategory name. No explanation.`;

async function classifyPlanningQuestion(
  anthropic: Anthropic,
  questionText: string
): Promise<string | null> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      system: PLANNING_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Classify this question:\n\n${questionText.slice(0, 800)}`,
        },
      ],
    });

    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return null;

    const result = text.text.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

    if ((PLANNING_SUBCATEGORIES as readonly string[]).includes(result)) {
      return result;
    }

    console.warn(`  Warning: unrecognized planning subcategory "${result}"`);
    return null;
  } catch (err) {
    console.error(
      `  Classification failed:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

// ── Aptitude fallback via Claude API ────────────────────────────────────────
const APTITUDE_SYSTEM_PROMPT = `You are classifying aptitude questions from JEE Paper 2 (B.Arch) exam.

Given a question, classify it into exactly ONE subcategory:

- spatial_visualization: 3D visualization, mental rotation, unfolding figures
- orthographic_projection: top/front/side views, plan and elevation
- pattern_recognition: sequence completion, pattern matching
- analogy: figure analogies, "A is to B as C is to ?"
- counting_figures: counting triangles, rectangles, lines in a figure
- odd_one_out: identifying the odd figure out
- surface_counting: counting surfaces of 3D objects
- mirror_image: mirror/water reflections
- embedded_figure: hidden figures in complex patterns
- architecture_gk: famous buildings, architects, monuments, cities, architectural history
- building_science: structural, thermal, acoustics, lighting, climate
- building_materials: construction materials and their properties
- building_services: electrical, plumbing, HVAC, fire safety
- design_fundamentals: design principles, urban planning, color theory

Return ONLY the subcategory name. No explanation.`;

async function classifyAptitudeQuestion(
  anthropic: Anthropic,
  questionText: string
): Promise<string | null> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      system: APTITUDE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Classify this aptitude question:\n\n${questionText.slice(0, 800)}`,
        },
      ],
    });

    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return null;

    const result = text.text.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

    if ((APTITUDE_SUBCATEGORIES as readonly string[]).includes(result)) {
      return result;
    }

    console.warn(`  Warning: unrecognized aptitude subcategory "${result}"`);
    return null;
  } catch (err) {
    console.error(
      `  Classification failed:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

// ── Types ───────────────────────────────────────────────────────────────────
interface QuestionRow {
  id: string;
  question_text: string;
  categories: string[];
  question_number?: number;
}

interface ClassificationResult {
  questionId: string;
  questionNumber: number | null;
  oldCategories: string[];
  newCategories: string[];
  subCategory: string;
  method: 'keyword' | 'claude_api' | 'skipped';
  textPreview: string;
}

interface PaperReport {
  paperId: string;
  year: number;
  session: string | null;
  shift: string | null;
  totalQuestions: number;
  results: ClassificationResult[];
  summary: {
    keywordClassified: number;
    aiClassified: number;
    skippedDrawing: number;
    unclassified: number;
  };
}

// ── Main processing ─────────────────────────────────────────────────────────
async function processPaper(
  supabase: ReturnType<typeof createClient>,
  anthropic: Anthropic | null,
  paperId: string
): Promise<PaperReport> {
  // Get paper metadata
  const { data: paper } = await supabase
    .from('nexus_qb_original_papers')
    .select('year, session, shift')
    .eq('id', paperId)
    .single();

  const year = paper?.year ?? 0;
  const session = paper?.session ?? null;
  const shift = paper?.shift ?? null;

  console.log(
    `\nProcessing: ${year}${session ? ` ${session}` : ''}${shift ? ` ${shift}` : ''}`
  );
  console.log('─'.repeat(50));

  // Fetch questions that have only a single broad category
  const { data: rawQuestions, error } = await supabase
    .from('nexus_qb_questions')
    .select('id, question_text, categories')
    .eq('original_paper_id', paperId);

  if (error || !rawQuestions) {
    console.error(`  Failed to fetch questions:`, error?.message);
    return {
      paperId,
      year,
      session,
      shift,
      totalQuestions: 0,
      results: [],
      summary: {
        keywordClassified: 0,
        aiClassified: 0,
        skippedDrawing: 0,
        unclassified: 0,
      },
    };
  }

  // Get question numbers from sources
  const questionIds = rawQuestions.map((q) => q.id);
  const { data: sources } = await supabase
    .from('nexus_qb_question_sources')
    .select('question_id, question_number')
    .in('question_id', questionIds);

  const questionNumberMap = new Map<string, number>();
  if (sources) {
    for (const s of sources) {
      questionNumberMap.set(s.question_id, s.question_number);
    }
  }

  // Filter to only questions with a single category (broad only)
  const questions: (QuestionRow & { question_number: number })[] = rawQuestions
    .filter((q) => q.categories && q.categories.length === 1)
    .map((q) => ({
      ...q,
      question_number: questionNumberMap.get(q.id) ?? 0,
    }))
    .sort((a, b) => a.question_number - b.question_number);

  console.log(
    `  ${rawQuestions.length} total, ${questions.length} need sub-categories`
  );

  const results: ClassificationResult[] = [];
  const summary = {
    keywordClassified: 0,
    aiClassified: 0,
    skippedDrawing: 0,
    unclassified: 0,
  };

  // Separate by broad category
  const mathQuestions = questions.filter((q) =>
    q.categories.includes('mathematics')
  );
  const aptitudeQuestions = questions.filter((q) =>
    q.categories.includes('aptitude')
  );
  const planningQuestions = questions.filter((q) =>
    q.categories.includes('planning')
  );
  const drawingQuestions = questions.filter((q) =>
    q.categories.includes('drawing')
  );

  console.log(
    `  Math: ${mathQuestions.length}, Aptitude: ${aptitudeQuestions.length}, Planning: ${planningQuestions.length}, Drawing: ${drawingQuestions.length}`
  );

  // ── Process aptitude (keyword first, then API fallback) ──
  const aptitudeFallback: typeof aptitudeQuestions = [];

  for (const q of aptitudeQuestions) {
    const subCat = classifyAptitudeByKeyword(q.question_text);
    if (subCat) {
      results.push({
        questionId: q.id,
        questionNumber: q.question_number,
        oldCategories: q.categories,
        newCategories: ['aptitude', subCat],
        subCategory: subCat,
        method: 'keyword',
        textPreview: q.question_text.slice(0, 80),
      });
      summary.keywordClassified++;
    } else {
      aptitudeFallback.push(q);
    }
  }

  if (aptitudeFallback.length > 0) {
    console.log(
      `  ${aptitudeFallback.length} aptitude questions need AI classification`
    );
    if (anthropic) {
      for (let i = 0; i < aptitudeFallback.length; i += BATCH_SIZE) {
        const batch = aptitudeFallback.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (q) => {
            const subCat = await classifyAptitudeQuestion(
              anthropic,
              q.question_text
            );
            return { q, subCat };
          })
        );

        for (const { q, subCat } of batchResults) {
          if (subCat) {
            results.push({
              questionId: q.id,
              questionNumber: q.question_number,
              oldCategories: q.categories,
              newCategories: ['aptitude', subCat],
              subCategory: subCat,
              method: 'claude_api',
              textPreview: q.question_text.slice(0, 80),
            });
            summary.aiClassified++;
          } else {
            results.push({
              questionId: q.id,
              questionNumber: q.question_number,
              oldCategories: q.categories,
              newCategories: q.categories,
              subCategory: 'UNKNOWN',
              method: 'claude_api',
              textPreview: q.question_text.slice(0, 80),
            });
            summary.unclassified++;
          }
        }

        if (i + BATCH_SIZE < aptitudeFallback.length) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    } else {
      console.warn(
        '  ANTHROPIC_API_KEY not set, skipping AI classification for aptitude fallback'
      );
      summary.unclassified += aptitudeFallback.length;
    }
  }

  // ── Process math (Claude API) ──
  if (mathQuestions.length > 0) {
    if (!anthropic) {
      console.warn(
        '  ANTHROPIC_API_KEY not set, skipping math classification'
      );
      summary.unclassified += mathQuestions.length;
    } else {
      console.log(`  Classifying ${mathQuestions.length} math questions via Claude API...`);
      for (let i = 0; i < mathQuestions.length; i += BATCH_SIZE) {
        const batch = mathQuestions.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (q) => {
            const subCat = await classifyMathQuestion(
              anthropic,
              q.question_text
            );
            return { q, subCat };
          })
        );

        for (const { q, subCat } of batchResults) {
          if (subCat) {
            results.push({
              questionId: q.id,
              questionNumber: q.question_number,
              oldCategories: q.categories,
              newCategories: ['mathematics', subCat],
              subCategory: subCat,
              method: 'claude_api',
              textPreview: q.question_text.slice(0, 80),
            });
            summary.aiClassified++;
          } else {
            results.push({
              questionId: q.id,
              questionNumber: q.question_number,
              oldCategories: q.categories,
              newCategories: q.categories,
              subCategory: 'UNKNOWN',
              method: 'claude_api',
              textPreview: q.question_text.slice(0, 80),
            });
            summary.unclassified++;
          }
        }

        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(mathQuestions.length / BATCH_SIZE);
        console.log(`    Math batch ${batchNum}/${totalBatches} done`);

        if (i + BATCH_SIZE < mathQuestions.length) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    }
  }

  // ── Process planning (Claude API) ──
  if (planningQuestions.length > 0) {
    if (!anthropic) {
      console.warn(
        '  ANTHROPIC_API_KEY not set, skipping planning classification'
      );
      summary.unclassified += planningQuestions.length;
    } else {
      console.log(`  Classifying ${planningQuestions.length} planning questions via Claude API...`);
      for (let i = 0; i < planningQuestions.length; i += BATCH_SIZE) {
        const batch = planningQuestions.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (q) => {
            const subCat = await classifyPlanningQuestion(
              anthropic,
              q.question_text
            );
            return { q, subCat };
          })
        );

        for (const { q, subCat } of batchResults) {
          if (subCat) {
            results.push({
              questionId: q.id,
              questionNumber: q.question_number,
              oldCategories: q.categories,
              newCategories: ['planning', subCat],
              subCategory: subCat,
              method: 'claude_api',
              textPreview: q.question_text.slice(0, 80),
            });
            summary.aiClassified++;
          } else {
            results.push({
              questionId: q.id,
              questionNumber: q.question_number,
              oldCategories: q.categories,
              newCategories: q.categories,
              subCategory: 'UNKNOWN',
              method: 'claude_api',
              textPreview: q.question_text.slice(0, 80),
            });
            summary.unclassified++;
          }
        }

        if (i + BATCH_SIZE < planningQuestions.length) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    }
  }

  // ── Skip drawing ──
  for (const q of drawingQuestions) {
    results.push({
      questionId: q.id,
      questionNumber: q.question_number,
      oldCategories: q.categories,
      newCategories: q.categories,
      subCategory: 'drawing',
      method: 'skipped',
      textPreview: q.question_text.slice(0, 80),
    });
    summary.skippedDrawing++;
  }

  // Sort results by question number
  results.sort(
    (a, b) => (a.questionNumber ?? 0) - (b.questionNumber ?? 0)
  );

  return { paperId, year, session, shift, totalQuestions: questions.length, results, summary };
}

// ── Apply updates to DB ─────────────────────────────────────────────────────
async function applyUpdates(
  supabase: ReturnType<typeof createClient>,
  reports: PaperReport[]
) {
  let totalUpdated = 0;
  let totalErrors = 0;

  for (const report of reports) {
    const updates = report.results.filter(
      (r) =>
        r.method !== 'skipped' &&
        r.subCategory !== 'UNKNOWN' &&
        r.newCategories.length > 1
    );

    if (updates.length === 0) continue;

    console.log(
      `\nApplying ${updates.length} updates for ${report.year}${report.session ? ` ${report.session}` : ''}${report.shift ? ` ${report.shift}` : ''}...`
    );

    // Group by new categories for efficient batch updates
    const grouped = new Map<string, string[]>();
    for (const u of updates) {
      const key = JSON.stringify(u.newCategories);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(u.questionId);
    }

    for (const [categoriesJson, questionIds] of grouped) {
      const categories = JSON.parse(categoriesJson) as string[];

      // Update in chunks of 50 to avoid query size limits
      for (let i = 0; i < questionIds.length; i += 50) {
        const chunk = questionIds.slice(i, i + 50);
        const { error } = await supabase
          .from('nexus_qb_questions')
          .update({
            categories,
            updated_at: new Date().toISOString(),
          })
          .in('id', chunk);

        if (error) {
          console.error(
            `  DB update failed for ${categories.join(',')}:`,
            error.message
          );
          totalErrors += chunk.length;
        } else {
          totalUpdated += chunk.length;
        }
      }
    }
  }

  return { totalUpdated, totalErrors };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('QB Sub-Category Classification');
  console.log('='.repeat(50));
  console.log(`Mode: ${dryRun ? 'DRY RUN (preview only)' : 'APPLY (writing to DB)'}\n`);

  const { supabase, anthropic } = getClients();

  const paperIds = singlePaperId ? [singlePaperId] : TARGET_PAPER_IDS;
  console.log(`Target papers: ${paperIds.length}\n`);

  const reports: PaperReport[] = [];

  for (const paperId of paperIds) {
    const report = await processPaper(supabase, anthropic, paperId);
    reports.push(report);

    // Print summary for this paper
    console.log(`  Summary:`);
    console.log(`    Keyword classified: ${report.summary.keywordClassified}`);
    console.log(`    AI classified: ${report.summary.aiClassified}`);
    console.log(`    Skipped (drawing): ${report.summary.skippedDrawing}`);
    console.log(`    Unclassified: ${report.summary.unclassified}`);

    if (dryRun) {
      // Show classifications
      for (const r of report.results) {
        if (r.method === 'skipped') continue;
        const marker =
          r.method === 'keyword' ? 'KW' : r.subCategory === 'UNKNOWN' ? '??' : 'AI';
        console.log(
          `    [${marker}] Q${r.questionNumber ?? '?'}: ${r.oldCategories[0]} -> ${r.newCategories.join(', ')} | ${r.textPreview}`
        );
      }
    }
  }

  // Overall summary
  console.log('\n' + '='.repeat(50));
  console.log('OVERALL SUMMARY');
  console.log('='.repeat(50));

  let totalKW = 0;
  let totalAI = 0;
  let totalSkip = 0;
  let totalUnknown = 0;

  for (const r of reports) {
    totalKW += r.summary.keywordClassified;
    totalAI += r.summary.aiClassified;
    totalSkip += r.summary.skippedDrawing;
    totalUnknown += r.summary.unclassified;
  }

  console.log(`Keyword classified: ${totalKW}`);
  console.log(`AI classified: ${totalAI}`);
  console.log(`Skipped (drawing): ${totalSkip}`);
  console.log(`Unclassified: ${totalUnknown}`);
  console.log(`Total processed: ${totalKW + totalAI + totalSkip + totalUnknown}`);

  // Apply if not dry run
  if (apply && !dryRun) {
    console.log('\nApplying updates to database...');
    const { totalUpdated, totalErrors } = await applyUpdates(
      supabase,
      reports
    );
    console.log(`\nDone. Updated: ${totalUpdated}, Errors: ${totalErrors}`);
  } else if (dryRun) {
    console.log('\nDry run complete. Run with --apply to write to database.');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
