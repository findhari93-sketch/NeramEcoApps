import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * POST /api/checklists/[id]/entries
 * Add an entry to a checklist. Supports 'module' and 'simple_item' types.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { entry_type, module_id, title, topic_id, sort_order, resources } = body;

    if (!entry_type || !['module', 'simple_item'].includes(entry_type)) {
      return NextResponse.json({ error: 'entry_type must be "module" or "simple_item"' }, { status: 400 });
    }

    if (entry_type === 'module' && !module_id) {
      return NextResponse.json({ error: 'module_id is required for module entries' }, { status: 400 });
    }

    if (entry_type === 'simple_item' && !title) {
      return NextResponse.json({ error: 'title is required for simple_item entries' }, { status: 400 });
    }

    // Insert the entry
    const { data: entry, error: entryError } = await (supabase as any)
      .from('nexus_checklist_entries')
      .insert({
        checklist_id: id,
        entry_type,
        module_id: module_id || null,
        title: title || null,
        topic_id: topic_id || null,
        sort_order: sort_order ?? 0,
      })
      .select()
      .single();

    if (entryError) throw entryError;

    // Insert resources if provided
    if (resources && Array.isArray(resources) && resources.length > 0) {
      const resourceRows = resources.map((r: { resource_type: string; url: string }) => ({
        entry_id: entry.id,
        resource_type: r.resource_type,
        url: r.url,
      }));

      const { error: resourceError } = await (supabase as any)
        .from('nexus_checklist_entry_resources')
        .insert(resourceRows);

      if (resourceError) throw resourceError;
    }

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add entry';
    console.error('Checklist entry POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
