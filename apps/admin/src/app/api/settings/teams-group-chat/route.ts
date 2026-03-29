// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

// GET /api/settings/teams-group-chat — Get the Teams group chat config
export async function GET() {
  try {
    const supabase = getSupabaseAdminClient() as any;
    const { data } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'teams_group_chat')
      .maybeSingle();

    return NextResponse.json({
      success: true,
      data: data?.setting_value || { chat_id: '', chat_name: '', auto_add_enabled: false },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT /api/settings/teams-group-chat — Update the Teams group chat config
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { chatId, chatName, autoAddEnabled } = body;

    const supabase = getSupabaseAdminClient() as any;

    const settingValue = {
      chat_id: chatId || '',
      chat_name: chatName || '',
      auto_add_enabled: autoAddEnabled !== false,
    };

    const { error } = await supabase
      .from('app_settings')
      .upsert(
        { setting_key: 'teams_group_chat', setting_value: settingValue, updated_at: new Date().toISOString() },
        { onConflict: 'setting_key' }
      );

    if (error) throw error;

    return NextResponse.json({ success: true, data: settingValue });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
