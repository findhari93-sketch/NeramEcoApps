import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

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
    const { question_ids, action } = body as {
      question_ids: string[];
      action: 'activate' | 'deactivate';
    };

    if (!question_ids || !Array.isArray(question_ids) || question_ids.length === 0) {
      return NextResponse.json({ error: 'question_ids required' }, { status: 400 });
    }

    if (!['activate', 'deactivate'].includes(action)) {
      return NextResponse.json({ error: 'action must be activate or deactivate' }, { status: 400 });
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
