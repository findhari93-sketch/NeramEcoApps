// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch {}
}

async function verifyToken(request: NextRequest): Promise<{ userId: string } | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  try {
    const decodedToken = await getAuth().verifyIdToken(authHeader.substring(7));
    const supabase = createAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', decodedToken.uid)
      .single();

    return user ? { userId: user.id } : null;
  } catch {
    return null;
  }
}

// GET /api/credentials - Get active credentials for authenticated student
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { data: credential } = await supabase
      .from('student_credentials')
      .select('*')
      .eq('user_id', auth.userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!credential) {
      return NextResponse.json({ hasCredentials: false, expired: false });
    }

    // Check if auto_destroy_at has passed — expire it
    if (credential.auto_destroy_at && new Date(credential.auto_destroy_at) < new Date()) {
      await supabase.from('student_credentials')
        .update({ is_active: false, destroyed_at: new Date().toISOString() })
        .eq('id', credential.id);
      return NextResponse.json({ hasCredentials: false, expired: true });
    }

    // On first view: set viewed_at and start 24h countdown
    if (!credential.viewed_at) {
      const autoDestroyAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await supabase.from('student_credentials')
        .update({ viewed_at: new Date().toISOString(), auto_destroy_at: autoDestroyAt })
        .eq('id', credential.id);
      credential.viewed_at = new Date().toISOString();
      credential.auto_destroy_at = autoDestroyAt;
    }

    return NextResponse.json({
      hasCredentials: true,
      credentialId: credential.id,
      email: credential.email,
      maskedPassword: '\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF',
      viewedAt: credential.viewed_at,
      autoDestroyAt: credential.auto_destroy_at,
      publishedAt: credential.published_at,
      credentialType: credential.credential_type,
    });
  } catch (error) {
    console.error('Error fetching credentials:', error);
    return NextResponse.json(
      { error: 'Failed to fetch credentials' },
      { status: 500 }
    );
  }
}

// POST /api/credentials - Reveal password
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyToken(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    if (body.action !== 'reveal') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (!body.credentialId) {
      return NextResponse.json({ error: 'Missing credentialId' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: credential } = await supabase
      .from('student_credentials')
      .select('password')
      .eq('id', body.credentialId)
      .eq('user_id', auth.userId)
      .eq('is_active', true)
      .maybeSingle();

    if (!credential) {
      return NextResponse.json({ error: 'Credential not found or expired' }, { status: 404 });
    }

    return NextResponse.json({
      password: credential.password,
    });
  } catch (error) {
    console.error('Error revealing credential:', error);
    return NextResponse.json(
      { error: 'Failed to reveal credential' },
      { status: 500 }
    );
  }
}

// DELETE /api/credentials - Student destroys credentials
export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyToken(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let credentialId: string | undefined;
    try {
      const body = await request.json();
      credentialId = body.credentialId;
    } catch {
      // body may be empty — fetch active credential instead
    }

    const supabase = createAdminClient();

    if (!credentialId) {
      const { data: active } = await supabase
        .from('student_credentials')
        .select('id')
        .eq('user_id', auth.userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!active) {
        return NextResponse.json({ error: 'No active credential found' }, { status: 404 });
      }
      credentialId = active.id;
    }

    const { error: destroyError } = await supabase
      .from('student_credentials')
      .update({ is_active: false, destroyed_at: new Date().toISOString() })
      .eq('id', credentialId)
      .eq('user_id', auth.userId);

    if (destroyError) {
      return NextResponse.json({ error: 'Failed to destroy credential' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error destroying credential:', error);
    return NextResponse.json(
      { error: 'Failed to destroy credential' },
      { status: 500 }
    );
  }
}
