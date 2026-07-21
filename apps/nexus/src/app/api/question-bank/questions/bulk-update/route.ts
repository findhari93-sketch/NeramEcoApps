import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, addQuestionTags, addQuestionTagPairs } from '@neram/database';

export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const msUser = await verifyMsToken(authHeader);
    const supabase = getSupabaseAdminClient();

    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (!['teacher', 'admin'].includes(caller.user_type ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { question_ids, action, tag_ids, assignments } = body as {
      question_ids?: string[];
      action: 'activate' | 'deactivate' | 'add_tags';
      tag_ids?: string[];
      assignments?: Array<{ question_id: string; tag_ids: string[] }>;
    };

    if (!['activate', 'deactivate', 'add_tags'].includes(action)) {
      return NextResponse.json({ error: 'action must be activate, deactivate or add_tags' }, { status: 400 });
    }

    // Additive bulk tagging. Two shapes: uniform ({question_ids, tag_ids}: same tags
    // onto every selected question) or pairs ({assignments}: per-question tag sets,
    // used by the tagging assistant commit). Never removes existing tags.
    if (action === 'add_tags') {
      if (Array.isArray(assignments) && assignments.length > 0) {
        // Pre-check question ids so one bad id (stale AI paste) cannot FK-fail
        // the whole batch; skipped ids are reported back.
        const ids = [...new Set(assignments.map((a) => a?.question_id).filter(Boolean))];
        const { data: existing } = await supabase.from('nexus_qb_questions').select('id').in('id', ids);
        const validIds = new Set((existing || []).map((r: any) => r.id));
        const validPairs = assignments.filter((a) => validIds.has(a.question_id));
        const skipped = assignments.length - validPairs.length;
        const { inserted } = await addQuestionTagPairs(validPairs, caller.id);
        return NextResponse.json({ data: { updated: validPairs.length, pairs: inserted, skipped } });
      }
      if (!Array.isArray(question_ids) || question_ids.length === 0 || !Array.isArray(tag_ids) || tag_ids.length === 0) {
        return NextResponse.json(
          { error: 'add_tags needs question_ids + tag_ids, or assignments pairs' },
          { status: 400 },
        );
      }
      const { inserted } = await addQuestionTags(question_ids, tag_ids, caller.id);
      return NextResponse.json({ data: { updated: question_ids.length, pairs: inserted } });
    }

    if (!question_ids || !Array.isArray(question_ids) || question_ids.length === 0) {
      return NextResponse.json({ error: 'question_ids required' }, { status: 400 });
    }

    if (action === 'activate') {
      // Set status='active' and is_active=true for questions that have answers
      const { data, error } = await supabase
        .from('nexus_qb_questions')
        .update({
          status: 'active',
          is_active: true,
          updated_at: new Date().toISOString(),
        } as any)
        .in('id', question_ids)
        .in('status' as any, ['answer_keyed', 'complete', 'active'])
        .select('id');
      if (error) throw error;

      return NextResponse.json({
        data: { updated: data?.length || 0 },
      });
    } else {
      // Deactivate: set is_active=false (keep status as-is)
      const { data, error } = await supabase
        .from('nexus_qb_questions')
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        } as any)
        .in('id', question_ids)
        .select('id');
      if (error) throw error;

      return NextResponse.json({
        data: { updated: data?.length || 0 },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Bulk update error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
