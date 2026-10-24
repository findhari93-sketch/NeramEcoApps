export const dynamic = 'force-dynamic';

/**
 * College dashboard accounts. Staff only (admin API middleware).
 *
 * GET   -> { data: AccountRow[], requests: AccountRequest[] }
 * POST  { college_id, name, email, phone?, designation?, role: owner|editor|viewer, request_id?, staff_name? }
 *       -> { success, id, invite_link, link_type: 'invite'|'magiclink', email_sent, email_note }
 *       409 when the email belongs to another college.
 * PATCH { id, action: 'resend' }                     -> { success, invite_link, link_type, email_sent, email_note }
 *       { id, action: 'set_role', role }             -> { success }   (409 when it would demote the last active owner)
 *       { id, action: 'deactivate' | 'reactivate' }  -> { success, warning? }
 *
 * invite_link: <marketing origin>/college-dashboard/welcome?token_hash=<hashed_token>&type=invite|magiclink
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { exactIlikePattern } from '@/lib/admin-api-auth';
import { isCollegeRole, removesLastOwner, validateInvite, type AccountLike, type CollegeRole } from '@/lib/college-accounts/invite';
import { generateAccountLink, sendInviteEmail } from '@/lib/college-accounts/service';
import { resolveStaff } from '@/lib/staff-actor';
import { UPSTREAM_FAILED } from '@/lib/upstream-status';

const noStore = { 'Cache-Control': 'no-store' };

const admins = () => getSupabaseAdminClient().from('college_admins' as never) as any;
const requests = () => getSupabaseAdminClient().from('college_account_requests' as never) as any;

interface CollegeRef {
  name: string;
  slug: string | null;
  state_slug: string | null;
  neram_tier: string | null;
}

interface AdminRow extends AccountLike {
  name: string;
  email: string;
  phone: string | null;
  designation: string | null;
  invited_at: string | null;
  invited_by: string | null;
  accepted_at: string | null;
  last_login_at: string | null;
  created_at: string;
  colleges: CollegeRef | null;
}

const COLUMNS =
  'id, college_id, name, email, phone, designation, role, is_active, invited_at, invited_by, accepted_at, last_login_at, created_at, colleges!college_admins_college_id_fkey(name, slug, state_slug, neram_tier)';

export async function GET() {
  const [acc, req] = await Promise.all([
    admins().select(COLUMNS).order('created_at', { ascending: false }).limit(2000),
    requests()
      .select('id, college_name, college_id, name, email, phone, designation, message, status, created_at, colleges(name, slug)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(200),
  ]);
  if (acc.error) return NextResponse.json({ error: acc.error.message }, { status: 500 });
  if (req.error) return NextResponse.json({ error: req.error.message }, { status: 500 });

  const data = ((acc.data ?? []) as AdminRow[]).map(({ colleges, ...r }) => ({
    ...r,
    college_name: colleges?.name ?? 'Unknown college',
    college_slug: colleges?.slug ?? '',
    college_state_slug: colleges?.state_slug ?? '',
    college_tier: colleges?.neram_tier ?? 'free',
  }));
  return NextResponse.json({ data, requests: req.data ?? [] }, { headers: noStore });
}

async function collegeName(collegeId: string): Promise<string | null> {
  const { data } = await (getSupabaseAdminClient().from('colleges' as never) as any)
    .select('name')
    .eq('id', collegeId)
    .maybeSingle();
  return (data as { name: string } | null)?.name ?? null;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const checked = validateInvite(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const input = checked.value;
  const staff = await resolveStaff(request, body);

  const college = await collegeName(input.college_id);
  if (!college) return NextResponse.json({ error: 'College not found.' }, { status: 404 });

  const { data: existingRows, error: findErr } = await admins()
    .select('id, college_id, colleges!college_admins_college_id_fkey(name)')
    .ilike('email', exactIlikePattern(input.email))
    .limit(1);
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  const existing = (existingRows ?? [])[0] as { id: string; college_id: string; colleges: { name: string } | null } | undefined;
  if (existing && existing.college_id !== input.college_id) {
    return NextResponse.json(
      {
        error: `${input.email} already has an account for ${existing.colleges?.name ?? 'another college'}. One email can manage only one college. Use a different email, or deactivate that account first.`,
      },
      { status: 409 },
    );
  }

  let link;
  try {
    link = await generateAccountLink(input.email, input.name, request.nextUrl.origin);
  } catch (err) {
    return NextResponse.json({ error: `Could not create the invite link: ${(err as Error).message}` }, { status: UPSTREAM_FAILED });
  }

  const now = new Date().toISOString();
  const row = {
    college_id: input.college_id,
    name: input.name,
    email: input.email,
    phone: input.phone,
    designation: input.designation,
    role: input.role,
    supabase_uid: link.userId,
    is_active: true,
    invited_at: now,
    invited_by: staff.name,
    updated_at: now,
  };
  const saved = existing
    ? await admins().update(row).eq('id', existing.id).select('id').single()
    : await admins().insert(row).select('id').single();
  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });

  if (input.request_id) {
    await requests()
      .update({ status: 'done', handled_by: staff.name, handled_at: now, college_id: input.college_id })
      .eq('id', input.request_id)
      .eq('status', 'pending');
  }

  const email = await sendInviteEmail({ to: input.email, name: input.name, collegeName: college, link: link.link, role: input.role });
  return NextResponse.json(
    { success: true, id: (saved.data as { id: string }).id, invite_link: link.link, link_type: link.type, ...email },
    { status: existing ? 200 : 201, headers: noStore },
  );
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  const action = body?.action;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: target, error } = await admins().select(COLUMNS).eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!target) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  const account = target as AdminRow;

  const collegeAccounts = async (): Promise<AccountLike[]> => {
    const { data } = await admins().select('id, college_id, role, is_active').eq('college_id', account.college_id);
    return (data ?? []) as AccountLike[];
  };

  if (action === 'resend') {
    if (!account.is_active) {
      return NextResponse.json({ error: 'This account is deactivated. Reactivate it first.' }, { status: 409 });
    }
    const staff = await resolveStaff(request, body);
    let link;
    try {
      link = await generateAccountLink(account.email, account.name, request.nextUrl.origin);
    } catch (err) {
      return NextResponse.json({ error: `Could not create the link: ${(err as Error).message}` }, { status: UPSTREAM_FAILED });
    }
    const now = new Date().toISOString();
    await admins().update({ supabase_uid: link.userId, invited_at: now, invited_by: staff.name, updated_at: now }).eq('id', id);
    const role: CollegeRole = isCollegeRole(account.role) ? account.role : 'editor';
    const email = await sendInviteEmail({
      to: account.email,
      name: account.name,
      collegeName: account.colleges?.name ?? 'your college',
      link: link.link,
      role,
    });
    return NextResponse.json({ success: true, invite_link: link.link, link_type: link.type, ...email }, { headers: noStore });
  }

  if (action === 'set_role') {
    const role = body?.role;
    if (!isCollegeRole(role)) return NextResponse.json({ error: 'Role must be owner, editor or viewer.' }, { status: 400 });
    if (removesLastOwner(await collegeAccounts(), account, { role })) {
      return NextResponse.json(
        { error: 'This is the only active owner of the college. Make someone else an owner first.' },
        { status: 409 },
      );
    }
    const { error: upErr } = await admins().update({ role, updated_at: new Date().toISOString() }).eq('id', id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === 'deactivate' || action === 'reactivate') {
    const is_active = action === 'reactivate';
    // Staff may remove the last owner (for example when a college leaves); the page warns first.
    const warning =
      !is_active && removesLastOwner(await collegeAccounts(), account, { is_active })
        ? 'The college now has no active owner. Nobody there can manage its team until you add or reactivate an owner.'
        : undefined;
    const { error: upErr } = await admins().update({ is_active, updated_at: new Date().toISOString() }).eq('id', id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    return NextResponse.json({ success: true, warning });
  }

  return NextResponse.json({ error: "action must be 'resend', 'set_role', 'deactivate' or 'reactivate'" }, { status: 400 });
}
