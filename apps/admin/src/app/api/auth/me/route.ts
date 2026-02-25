import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/auth/me - Resolve Microsoft auth user to Supabase user
 *
 * Query params:
 *   msOid - Microsoft Object ID (localAccountId from MSAL)
 *   email - Fallback email lookup
 *
 * Returns the Supabase user record with id, name, email
 */
export async function GET(request: NextRequest) {
  const msOid = request.nextUrl.searchParams.get('msOid');
  const email = request.nextUrl.searchParams.get('email');

  if (!msOid && !email) {
    return NextResponse.json(
      { error: 'msOid or email is required' },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdminClient();

    // Try ms_oid lookup first (primary identifier for Microsoft users)
    if (msOid) {
      const { data } = await (supabase as any)
        .from('users')
        .select('id, name, first_name, last_name, email, ms_oid, user_type')
        .eq('ms_oid', msOid)
        .single();

      if (data) {
        return NextResponse.json({
          user: {
            id: data.id,
            name: data.name || [data.first_name, data.last_name].filter(Boolean).join(' ') || 'Admin',
            email: data.email,
          },
        });
      }
    }

    // Fallback to email lookup
    if (email) {
      const { data } = await (supabase as any)
        .from('users')
        .select('id, name, first_name, last_name, email, ms_oid, user_type')
        .eq('email', email)
        .single();

      if (data) {
        // If found by email but ms_oid not set, update it for future lookups
        if (msOid && !data.ms_oid) {
          await (supabase as any)
            .from('users')
            .update({ ms_oid: msOid })
            .eq('id', data.id);
        }

        return NextResponse.json({
          user: {
            id: data.id,
            name: data.name || [data.first_name, data.last_name].filter(Boolean).join(' ') || 'Admin',
            email: data.email,
          },
        });
      }
    }

    // Auto-create admin user if not found
    if (email) {
      const { data: newUser, error: createError } = await (supabase as any)
        .from('users')
        .insert({
          email,
          ms_oid: msOid || null,
          user_type: 'admin',
          status: 'active',
          email_verified: true,
          name: email.split('@')[0],
        })
        .select('id, name, email')
        .single();

      if (createError) {
        console.error('Failed to auto-create admin user:', createError);
        return NextResponse.json(
          { error: 'Admin user not found and could not be created' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        user: {
          id: newUser.id,
          name: newUser.name || 'Admin',
          email: newUser.email,
        },
      });
    }

    return NextResponse.json(
      { error: 'Admin user not found in database' },
      { status: 404 }
    );
  } catch (error: any) {
    console.error('Auth me error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to resolve admin user' },
      { status: 500 }
    );
  }
}
