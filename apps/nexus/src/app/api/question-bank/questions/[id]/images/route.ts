import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import type { NexusQBQuestionOption } from '@neram/database';

/**
 * Lightweight endpoint for updating only image fields on a question.
 * Used by the Bulk Images tab for rapid image uploads.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const body = await request.json();
    const { question_image_url, option_images } = body as {
      question_image_url?: string | null;
      option_images?: Record<string, string | null>;
    };

    // Fetch current question
    const { data: existing, error: fetchError } = await supabase
      .from('nexus_qb_questions')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // Update question image
    if (question_image_url !== undefined) {
      updates.question_image_url = question_image_url;
    }

    // Update option images by merging into existing options JSONB
    if (option_images && typeof option_images === 'object') {
      const currentOptions = (existing as any).options as NexusQBQuestionOption[] | null;
      if (currentOptions && Array.isArray(currentOptions)) {
        const updatedOptions = currentOptions.map((opt) => {
          if (opt.id in option_images) {
            return { ...opt, image_url: option_images[opt.id] ?? undefined };
          }
          return opt;
        });
        updates.options = updatedOptions;
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('nexus_qb_questions')
      .update(updates as any)
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Image update error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
