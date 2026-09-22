import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import { getSupabaseAdminClient } from '@neram/database';

import { describeError } from '@/lib/api-errors';
import { classifySolutionVideo, INVALID_VIDEO_MESSAGE } from '@/lib/solution-video';
import { readDrawingParts } from '@/lib/drawing-parts';

/** Writes run this many at a time: an 80-row paper was 80 round trips in a row. */
const WRITE_CHUNK = 10;

type LinkResult =
  | { question_id: string; ok: true; solution_video_url: string | null }
  | { question_id: string; ok: false; error: string };

/**
 * Save a paper's solution videos, from the paper's Videos mode.
 *
 * Body: `{ links: [{ question_id, solution_video_url }] }`. A null or blank
 * value clears the video, stored as NULL and never '' (the paper's solutions
 * count reads NOT NULL, so '' would count as solved).
 *
 * Every row is judged on its own and reported back, so one bad link does not
 * sink the other fifty-eight:
 * - a link that is not YouTube or SharePoint is refused
 * - a question from another paper is refused
 * - a split drawing is refused: its videos live on its parts, and a
 *   question-level write would be overwritten by the next editor save
 * YouTube links are stored in one canonical form (see lib/solution-video.ts).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const access = await verifyQBStaff(authHeader);
    if (!access.ok) return access.response;
    const supabase = getSupabaseAdminClient();

    const body = await request.json();
    const { links } = body as {
      links: { question_id: string; solution_video_url: string | null }[];
    };

    if (!Array.isArray(links) || links.length === 0) {
      return NextResponse.json({ error: 'No links provided' }, { status: 400 });
    }

    if (links.length > 500) {
      return NextResponse.json({ error: 'Maximum 500 links per request' }, { status: 400 });
    }

    const questionIds = links.map((l) => l.question_id);
    const { data: paperQuestions, error: readError } = await supabase
      .from('nexus_qb_questions')
      .select('id, question_format, drawing_parts')
      .eq('original_paper_id', params.id)
      .in('id', questionIds);
    if (readError) throw readError;

    const onPaper = new Map(
      // drawing_parts is newer than the generated types, hence the unknown hop.
      ((paperQuestions || []) as unknown as { id: string; question_format: string | null; drawing_parts: unknown }[]).map(
        (q) => [q.id, q],
      ),
    );

    // Judge every row first, in the order sent, so the response lines up with
    // the request whatever order the writes finish in.
    const results: (LinkResult | null)[] = links.map(() => null);
    const writes: { index: number; question_id: string; value: string | null }[] = [];

    links.forEach((link, index) => {
      const question = onPaper.get(link.question_id);
      if (!question) {
        results[index] = { question_id: link.question_id, ok: false, error: 'This question is not on this paper' };
        return;
      }
      if (question.question_format === 'DRAWING_PROMPT' && readDrawingParts(question.drawing_parts)) {
        results[index] = {
          question_id: link.question_id,
          ok: false,
          error: 'This drawing has parts: set its videos per part',
        };
        return;
      }
      const video = classifySolutionVideo(link.solution_video_url);
      if (video.kind === 'invalid') {
        results[index] = { question_id: link.question_id, ok: false, error: INVALID_VIDEO_MESSAGE };
        return;
      }
      writes.push({ index, question_id: link.question_id, value: video.kind === 'empty' ? null : video.url });
    });

    for (let i = 0; i < writes.length; i += WRITE_CHUNK) {
      const chunk = writes.slice(i, i + WRITE_CHUNK);
      await Promise.all(
        chunk.map(async (write) => {
          const { error: updateError } = await supabase
            .from('nexus_qb_questions')
            .update({
              solution_video_url: write.value,
              updated_at: new Date().toISOString(),
            } as any)
            .eq('id', write.question_id);
          results[write.index] = updateError
            ? { question_id: write.question_id, ok: false, error: updateError.message }
            : { question_id: write.question_id, ok: true, solution_video_url: write.value };
        }),
      );
    }

    const settled = results as LinkResult[];
    const updated = settled.filter((r) => r.ok).length;

    return NextResponse.json({
      data: { updated, results: settled },
      message: `${updated} video link${updated !== 1 ? 's' : ''} saved`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Video Links API] Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
