/**
 * AI Video Classification Script
 *
 * Uses Claude Haiku 4.5 to classify all unclassified videos in the library.
 * Extracts: category, subcategories, exam, language, difficulty, topics, suggested_title.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... SUPABASE_SERVICE_ROLE_KEY=... npx tsx library-classify.ts
 *
 * Options:
 *   --limit N     Process only N videos (default: all)
 *   --dry-run     Print classifications without writing to DB
 *   --force       Re-classify already-classified videos
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// ── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://db-staging.neramclasses.com';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

const BATCH_SIZE = 10; // Concurrent API calls
const CATEGORIES = ['drawing', 'aptitude', 'mathematics', 'general_knowledge', 'exam_preparation', 'orientation'] as const;
const EXAMS = ['nata', 'jee_barch', 'both', 'general'] as const;
const LANGUAGES = ['ta', 'en', 'ta_en'] as const;
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;

// ── Parse CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 0;

// ── Clients ─────────────────────────────────────────────────────────────────
function getClients() {
  if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY env var is required.');
    process.exit(1);
  }
  if (!ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY env var is required.');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  return { supabase, anthropic };
}

// ── Classification prompt ───────────────────────────────────────────────────
function buildClassificationPrompt(title: string, description: string): string {
  return `You are classifying educational YouTube videos from Neram Classes, an architecture entrance exam coaching institute in India that prepares students for NATA and JEE B.Arch exams.

Given a video title and description, classify it into the following fields. Return ONLY valid JSON, no markdown.

Fields:
- "category": one of ${JSON.stringify([...CATEGORIES])}
- "subcategories": array of specific subtopics (e.g. ["perspective drawing", "1-point perspective"])
- "exam": one of ${JSON.stringify([...EXAMS])}. Use "nata" if NATA-specific, "jee_barch" if JEE-specific, "both" if relevant to both, "general" if not exam-specific
- "language": one of ${JSON.stringify([...LANGUAGES])}. Most videos are Tamil ("ta"). If title has English terms mixed with Tamil context, use "ta_en". Pure English use "en"
- "difficulty": one of ${JSON.stringify([...DIFFICULTIES])}. "beginner" for intro/basics, "intermediate" for practice, "advanced" for complex topics
- "topics": array of 2-5 topic tags (e.g. ["perspective", "vanishing point", "architectural drawing"])
- "suggested_title": a clean, descriptive title in English (remove "Day X" prefixes, fix spacing, make it descriptive)
- "confidence": 0.0 to 1.0 — how confident you are in the classification

Context about Neram Classes:
- Teaches NATA (National Aptitude Test in Architecture) and JEE B.Arch paper 2
- Subjects: Drawing/Sketching, Aptitude (logical reasoning, spatial), Mathematics, General Knowledge
- "Orientation" = introductory sessions about the course or exams
- Videos titled "Day N" are part of a course sequence
- Tamil language is common; English technical terms are mixed in

VIDEO TITLE: ${title}
VIDEO DESCRIPTION: ${description ? description.slice(0, 500) : '(no description)'}

Return JSON only:`;
}

// ── Classify a single video ─────────────────────────────────────────────────
interface Classification {
  category: string;
  subcategories: string[];
  exam: string;
  language: string;
  difficulty: string;
  topics: string[];
  suggested_title: string;
  confidence: number;
}

async function classifyVideo(
  anthropic: Anthropic,
  title: string,
  description: string
): Promise<Classification | null> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      messages: [
        { role: 'user', content: buildClassificationPrompt(title, description) },
      ],
    });

    const text = response.content.find(b => b.type === 'text');
    if (!text || text.type !== 'text') return null;

    // Parse JSON from response (handle potential markdown wrapping)
    let jsonStr = text.text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonStr);

    // Validate and sanitize
    return {
      category: CATEGORIES.includes(parsed.category) ? parsed.category : 'general_knowledge',
      subcategories: Array.isArray(parsed.subcategories) ? parsed.subcategories : [],
      exam: EXAMS.includes(parsed.exam) ? parsed.exam : 'both',
      language: LANGUAGES.includes(parsed.language) ? parsed.language : 'ta',
      difficulty: DIFFICULTIES.includes(parsed.difficulty) ? parsed.difficulty : 'intermediate',
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      suggested_title: typeof parsed.suggested_title === 'string' ? parsed.suggested_title : title,
      confidence: typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5,
    };
  } catch (err) {
    console.error(`  ❌ Classification failed for "${title}":`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Process in batches ──────────────────────────────────────────────────────
async function processBatch(
  anthropic: Anthropic,
  supabase: ReturnType<typeof createClient>,
  videos: Array<{ id: string; original_title: string; original_description: string }>,
  batchNum: number
) {
  const results = await Promise.all(
    videos.map(async (video) => {
      const classification = await classifyVideo(
        anthropic,
        video.original_title || '',
        video.original_description || ''
      );
      return { video, classification };
    })
  );

  let successCount = 0;
  let errorCount = 0;

  for (const { video, classification } of results) {
    if (!classification) {
      errorCount++;
      continue;
    }

    if (dryRun) {
      console.log(`  📋 ${video.original_title}`);
      console.log(`     → ${classification.category} | ${classification.exam} | ${classification.language} | ${classification.difficulty}`);
      console.log(`     → Topics: ${classification.topics.join(', ')}`);
      console.log(`     → Title: ${classification.suggested_title}`);
      console.log(`     → Confidence: ${classification.confidence}`);
      successCount++;
      continue;
    }

    const { error } = await supabase
      .from('library_videos')
      .update({
        category: classification.category,
        subcategories: classification.subcategories,
        exam: classification.exam,
        language: classification.language,
        difficulty: classification.difficulty,
        topics: classification.topics,
        suggested_title: classification.suggested_title,
        ai_confidence: classification.confidence,
        classification_status: 'classified',
        updated_at: new Date().toISOString(),
      })
      .eq('id', video.id);

    if (error) {
      console.error(`  ❌ DB update failed for ${video.id}:`, error.message);
      errorCount++;
    } else {
      successCount++;
    }
  }

  console.log(`  Batch ${batchNum}: ${successCount} classified, ${errorCount} errors`);
  return { successCount, errorCount };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🤖 Neram Video Library — AI Classification');
  console.log('═══════════════════════════════════════════\n');

  if (dryRun) console.log('🔍 DRY RUN MODE — no DB writes\n');

  const { supabase, anthropic } = getClients();

  // Fetch unclassified videos
  let query = supabase
    .from('library_videos')
    .select('id, original_title, original_description')
    .order('published_at', { ascending: true });

  if (!force) {
    query = query.or('classification_status.is.null,classification_status.eq.pending,classification_status.eq.error');
  }

  if (limit > 0) {
    query = query.limit(limit);
  }

  const { data: videos, error } = await query;
  if (error) {
    console.error('❌ Failed to fetch videos:', error.message);
    process.exit(1);
  }

  if (!videos || videos.length === 0) {
    console.log('✅ No videos to classify. Use --force to re-classify all.');
    return;
  }

  console.log(`📹 Found ${videos.length} videos to classify`);
  console.log(`📊 Using Claude Haiku 4.5 (${BATCH_SIZE} concurrent)\n`);

  let totalSuccess = 0;
  let totalErrors = 0;

  for (let i = 0; i < videos.length; i += BATCH_SIZE) {
    const batch = videos.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(videos.length / BATCH_SIZE);

    console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${i + 1}-${Math.min(i + BATCH_SIZE, videos.length)}/${videos.length})`);

    const { successCount, errorCount } = await processBatch(anthropic, supabase, videos, batchNum);
    totalSuccess += successCount;
    totalErrors += errorCount;

    // Small delay between batches to avoid rate limits
    if (i + BATCH_SIZE < videos.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log('\n═══════════════════════════════════════════');
  console.log(`✅ Classification complete!`);
  console.log(`   Classified: ${totalSuccess}`);
  console.log(`   Errors: ${totalErrors}`);
  console.log(`   Total: ${videos.length}`);

  if (dryRun) {
    console.log('\n💡 Run without --dry-run to save to database.');
  } else {
    console.log('\n🎯 Next steps:');
    console.log('  1. Review classifications in Nexus: /teacher/library/review');
    console.log('  2. Bulk approve high-confidence videos');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
