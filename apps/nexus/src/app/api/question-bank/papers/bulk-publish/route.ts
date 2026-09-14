/**
 * Publish ready papers in one press.
 *
 * The per paper switch lives in each paper's Student access tab. This exists
 * because the first run means visiting every paper before a student sees a
 * single one, which is how a bank of two dozen parsed papers ends up invisible.
 *
 * Two shapes:
 * - No body: every ready paper, of every exam. The original behaviour.
 * - `{ paper_ids }`: exactly those papers. Each exam page lists its own papers
 *   and publishes what it shows; an exam page that quietly published the other
 *   exam's papers too would be doing something nobody on it could see.
 */

import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, messageOf } from '@/lib/api-errors';
import { verifyQBStaff } from '@/lib/qb-auth';
import {
  getSupabaseAdminClient,
  publishReadyPapers,
  setPaperStudentVisibility,
} from '@neram/database';
import type { BulkPublishResult } from '@neram/database';
import { MAX_BULK_PUBLISH_IDS, parsePaperIds } from '@/lib/qb-bulk-publish';

export async function POST(request: NextRequest) {
  try {
    const access = await verifyQBStaff(request.headers.get('Authorization'));
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => null);
    const ids = parsePaperIds(body);
    if (ids === 'invalid') {
      return NextResponse.json(
        { error: `paper_ids must be a list of up to ${MAX_BULK_PUBLISH_IDS} paper ids.` },
        { status: 400 },
      );
    }

    const result = ids ? await publishPapers(ids) : await publishReadyPapers();
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('[QB Papers Bulk Publish] POST:', messageOf(err), err);
    return errorResponse(err, 'Something went wrong.');
  }
}

/**
 * The named papers, one at a time through the same gate the per paper switch
 * uses, so a paper with nothing to show is refused with its reason rather than
 * published as a card that opens an empty screen.
 */
async function publishPapers(ids: string[]): Promise<BulkPublishResult> {
  const supabase = getSupabaseAdminClient();
  // `as any` as qb-papers.ts does: the generated types predate is_student_visible.
  const { data, error } = await supabase
    .from('nexus_qb_original_papers' as any)
    .select('id, exam_type, year, session, shift, is_student_visible')
    .in('id', ids);
  if (error) throw error;

  const papers = (data ?? []) as unknown as {
    id: string;
    exam_type: string;
    year: number;
    session: string | null;
    shift: string | null;
    is_student_visible: boolean;
  }[];

  const result: BulkPublishResult = { published: 0, already_visible: 0, skipped: [] };
  for (const paper of papers) {
    if (paper.is_student_visible) {
      result.already_visible++;
      continue;
    }
    try {
      await setPaperStudentVisibility(paper.id, true, supabase);
      result.published++;
    } catch (err) {
      const suffix = [paper.session, paper.shift].filter(Boolean).join(' ');
      result.skipped.push({
        id: paper.id,
        label: `${paper.year}${suffix ? ` ${suffix}` : ''}: ${messageOf(err)}`,
      });
    }
  }
  return result;
}
