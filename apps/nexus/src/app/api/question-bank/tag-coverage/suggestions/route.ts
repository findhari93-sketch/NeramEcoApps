import { NextRequest, NextResponse } from 'next/server';
import { addQuestionTagPairs, getSupabaseAdminClient } from '@neram/database';
import { verifyQBStaff } from '@/lib/qb-auth';
import { ApiError, describeError, errorResponse } from '@/lib/api-errors';
import {
  decorateSuggestions,
  findTagSuggestions,
  groupPairsByQuestion,
  isUuid,
  loadCoverageRegistry,
  resolveTopic,
  validatePairs,
  writeDismissals,
} from '@/lib/qb-tag-coverage';

const MAX_LIMIT = 50;

function intParam(value: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * GET /api/question-bank/tag-coverage/suggestions
 *   ?tag=<slug> | ?tag_id=<uuid>
 *   &limit=20 (1 to 50) &offset=0 &confidence=high|all (default all)
 *   &count_only=1
 *
 * Questions the keyword dictionary suggests for one tag, that do not carry it
 * yet and were not dismissed for it ("Not this topic"). Staff only.
 *
 * { data: { tag: { id, slug, label }, total, high_confidence_total,
 *           items: [{ id, question_text, options, correct_answer, exam_relevance,
 *                     origin, matched_terms, confidence,
 *                     also_suggested: [{ tag_id, slug, label }], source_label,
 *                     has_topic_tag }] } }
 *
 * `total` and `high_confidence_total` always describe the whole queue for the
 * tag; `confidence=high` narrows only `items`. With count_only=1 the response is
 * { data: { tag, total, high_confidence_total } } and nothing else. The test
 * builder's bank picker reads that shape, so keep it exactly.
 */
export async function GET(request: NextRequest) {
  try {
    const access = await verifyQBStaff(request.headers.get('Authorization'));
    if (!access.ok) return access.response;

    const params = request.nextUrl.searchParams;
    const supabase = getSupabaseAdminClient();
    const registry = await loadCoverageRegistry(supabase);
    const tag = resolveTopic(registry, { slug: params.get('tag'), tagId: params.get('tag_id') });

    const all = await findTagSuggestions(supabase, registry, tag);
    const high = all.filter((s) => s.confidence === 'high');
    const tagRef = { id: tag.id, slug: tag.slug, label: tag.label };

    if (params.get('count_only') === '1' || params.get('count_only') === 'true') {
      return NextResponse.json({ data: { tag: tagRef, total: all.length, high_confidence_total: high.length } });
    }

    const confidence = params.get('confidence') === 'high' ? 'high' : 'all';
    const limit = intParam(params.get('limit'), 20, 1, MAX_LIMIT);
    const offset = intParam(params.get('offset'), 0, 0, 100_000);
    const pool = confidence === 'high' ? high : all;
    const items = await decorateSuggestions(supabase, registry, tag, pool.slice(offset, offset + limit));

    return NextResponse.json({
      data: { tag: tagRef, total: all.length, high_confidence_total: high.length, items },
    });
  } catch (err) {
    console.error('[QB tag coverage] suggestions GET failed:', describeError(err));
    return errorResponse(err, 'Could not load suggestions');
  }
}

/**
 * POST /api/question-bank/tag-coverage/suggestions
 *
 *   { action: 'accept',  pairs: [{ question_id, tag_id }] }  -> { data: { accepted, skipped } }
 *   { action: 'dismiss', pairs: [{ question_id, tag_id }] }  -> { data: { dismissed, skipped } }
 *   { action: 'accept_all_high', tag_id }                     -> { data: { accepted } }
 *
 * Accepting only ever ADDS tags (addQuestionTagPairs); nothing is removed.
 * accept_all_high re-runs the match on the server rather than trusting a list
 * from the client, so it tags exactly what the queue shows as high confidence.
 * At most 500 pairs per request.
 */
export async function POST(request: NextRequest) {
  try {
    const access = await verifyQBStaff(request.headers.get('Authorization'));
    if (!access.ok) return access.response;
    const caller = access.caller;

    const body = (await request.json().catch(() => null)) as {
      action?: string;
      pairs?: unknown;
      tag_id?: unknown;
    } | null;
    if (!body || typeof body !== 'object') throw new ApiError('Send a JSON body', 400);

    const supabase = getSupabaseAdminClient();
    const registry = await loadCoverageRegistry(supabase);

    if (body.action === 'accept') {
      const { pairs, skipped } = await validatePairs(supabase, registry, body.pairs);
      const { inserted } = await addQuestionTagPairs(groupPairsByQuestion(pairs), caller.id, supabase);
      return NextResponse.json({ data: { accepted: inserted, skipped } });
    }

    if (body.action === 'dismiss') {
      const { pairs, skipped } = await validatePairs(supabase, registry, body.pairs);
      const dismissed = await writeDismissals(supabase, pairs, caller.id);
      return NextResponse.json({ data: { dismissed, skipped } });
    }

    if (body.action === 'accept_all_high') {
      if (!isUuid(body.tag_id)) throw new ApiError('tag_id must be a uuid', 400);
      const tag = resolveTopic(registry, { tagId: body.tag_id });
      const high = (await findTagSuggestions(supabase, registry, tag)).filter((s) => s.confidence === 'high');
      const { inserted } = await addQuestionTagPairs(
        high.map((s) => ({ question_id: s.id, tag_ids: [tag.id] })),
        caller.id,
        supabase,
      );
      return NextResponse.json({ data: { accepted: inserted } });
    }

    throw new ApiError('action must be accept, dismiss or accept_all_high', 400);
  } catch (err) {
    console.error('[QB tag coverage] suggestions POST failed:', describeError(err));
    return errorResponse(err, 'Could not save');
  }
}
