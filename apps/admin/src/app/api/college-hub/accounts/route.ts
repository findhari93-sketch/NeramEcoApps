// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('college_admins')
    .select('id, name, email, phone, designation, role, is_active, invited_at, created_at, colleges(name, slug)')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((r) => ({
    ...r,
    college_name: (r.colleges as { name: string; slug: string } | null)?.name ?? 'Unknown',
    college_slug: (r.colleges as { name: string; slug: string } | null)?.slug ?? '',
  }));
  return NextResponse.json({ data: rows });
}

export async function POST(request: NextRequest) {
  const { college_id, name, email, phone, designation, role } = await request.json();

  if (!college_id || !name || !email || !role) {
    return NextResponse.json(
      { error: 'college_id, name, email, and role are required' },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const tempPassword = generateTempPassword();

  // Create the Supabase Auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { name, role: 'college_admin' },
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  // Insert college_admins row linked to the auth user
  const { data: adminRow, error: insertError } = await supabase
    .from('college_admins')
    .insert({
      college_id,
      name,
      email,
      phone: phone || null,
      designation: designation || null,
      role,
      supabase_uid: authData.user.id,
      is_active: true,
      invited_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insertError) {
    // Rollback: delete the auth user we just created
    await supabase.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    id: adminRow.id,
    temp_password: tempPassword,
    message: `Account created. Share these login credentials with ${name}: Email: ${email}, Password: ${tempPassword}`,
  });
}

export async function PATCH(request: NextRequest) {
  const { id, is_active } = await request.json();
  if (!id || typeof is_active !== 'boolean') {
    return NextResponse.json({ error: 'id and is_active required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('college_admins')
    .update({ is_active })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
