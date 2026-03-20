import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import type { SolutionEntry } from '@/lib/solution-csv-parser';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const msUser = await verifyMsToken(authHeader);
    const supabase = getSupabaseAdminClient();

    // Verify caller is teacher or admin
    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!['teacher', 'admin'].includes(caller.user_type ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { solutions } = body as { solutions: SolutionEntry[] };

    if (!solutions || !Array.isArray(solutions) || solutions.length === 0) {
      return NextResponse.json({ error: 'solutions array is required' }, { status: 400 });
    }

    if (solutions.length > 500) {
      return NextResponse.json(
        { error: 'Maximum 500 solutions per upload' },
        { status: 400 }
      );
    }

    const updated: string[] = [];
    const not_found: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < solutions.length; i++) {
      const entry = solutions[i];
      const label = entry.nta_question_id
        ? `NTA:${entry.nta_question_id}`
        : `${entry.exam_type}/${entry.year}/${entry.session || '-'}/#${entry.question_number || '?'}`;

      try {
        let questionId: string | null = null;

        if (entry.match_by === 'nta_question_id' && entry.nta_question_id) {
          // Match by NTA question ID directly on nexus_qb_questions
          const { data } = await supabase
            .from('nexus_qb_questions')
            .select('id')
            .eq('nta_question_id', entry.nta_question_id)
            .limit(1)
            .single();

          questionId = data?.id ?? null;
        } else if (entry.match_by === 'source' && entry.exam_type && entry.year != null) {
          // Match via nexus_qb_question_sources
          let query = supabase
            .from('nexus_qb_question_sources')
            .select('question_id')
            .eq('exam_type', entry.exam_type)
            .eq('year', entry.year);

          if (entry.session) {
            query = query.eq('session', entry.session);
          }
          if (entry.question_number != null) {
            query = query.eq('question_number', entry.question_number);
          }

          const { data } = await query.limit(1).single();
          questionId = data?.question_id ?? null;
        }

        if (!questionId) {
          not_found.push(label);
          continue;
        }

        // Build update object with only non-null solution fields
        const updateFields: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };

        if (entry.solution_video_url !== undefined) {
          updateFields.solution_video_url = entry.solution_video_url;
        }
        if (entry.explanation_brief !== undefined) {
          updateFields.explanation_brief = entry.explanation_brief;
        }
        if (entry.explanation_detailed !== undefined) {
          updateFields.explanation_detailed = entry.explanation_detailed;
        }

        const { error: updateError } = await supabase
          .from('nexus_qb_questions')
          .update(updateFields as any)
          .eq('id', questionId);

        if (updateError) {
          errors.push(`${label}: ${updateError.message}`);
        } else {
          updated.push(label);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`${label}: ${msg}`);
      }
    }

    return NextResponse.json({
      data: {
        updated: updated.length,
        updated_labels: updated,
        not_found,
        errors,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Bulk solution upload error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
