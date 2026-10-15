export const dynamic = 'force-dynamic';

/**
 * College update links: a no-login form staff send to a college on WhatsApp.
 *
 * GET   /api/college-hub/update-links?college_id=<uuid>   (college_id optional)
 *       -> { data: LinkRow[], college? }  newest first, at most 200. With college_id the
 *          response also carries that college (so a shortcut can prefill the dialog).
 *          LinkRow = row (no token_hash) + college { id, name, slug, state_slug, city }
 *                    + status + pending_reviews (pending content submissions for that college)
 * POST  { college_id, recipient_name?, recipient_phone?, sections?, expires_in_days?: 7|14|30,
 *         note?, replace_link_id?, staff_name? }
 *       -> 201 { link, url, message, whatsapp_url }
 *          replace_link_id cancels that older link (same college) in the same request.
 * PATCH { id, action: 'extend' | 'cancel', staff_name? } -> { link }   409 when the link is cancelled.
 *
 * Only the sha256 of the token is stored; the raw token exists only in the URL
 * returned by POST. Staff only (admin API middleware).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { marketingOriginFor } from '@/lib/marketing-links';
import { resolveStaff } from '@/lib/staff-actor';
import {
  buildMessage,
  extendedExpiry,
  linkStatus,
  validateCreateLink,
  whatsappUrl,
} from '@/lib/college-update-links/helpers';
import { hashToken, newToken, updateLinkUrl } from '@/lib/college-update-links/tokens';

const noStore = { 'Cache-Control': 'no-store' };
const db = () => getSupabaseAdminClient();
const links = () => db().from('college_update_links' as never) as any;

const LINK_COLUMNS =
  'id, college_id, sections, recipient_name, recipient_phone, note, created_by, created_at, expires_at, revoked_at, revoked_by, first_opened_at, last_opened_at, open_count, submitted_at, submit_count';
const COLLEGE_COLUMNS = 'id, name, slug, state_slug, city';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface College {
  id: string;
  name: string;
  slug: string | null;
  state_slug: string | null;
  city: string | null;
}

interface LinkRow {
  id: string;
  college_id: string;
  sections: string[];
  recipient_name: string | null;
  recipient_phone: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  first_opened_at: string | null;
  last_opened_at: string | null;
  open_count: number;
  submitted_at: string | null;
  submit_count: number;
}

function withStatus<T extends LinkRow>(row: T, now = new Date()) {
  return { ...row, status: linkStatus(row, now) };
}

export async function GET(request: NextRequest) {
  const collegeId = request.nextUrl.searchParams.get('college_id');
  if (collegeId && !UUID_RE.test(collegeId)) return NextResponse.json({ error: 'Unknown college.' }, { status: 400 });

  let q = links().select(`${LINK_COLUMNS}, colleges(${COLLEGE_COLUMNS})`).order('created_at', { ascending: false }).limit(200);
  if (collegeId) q = q.eq('college_id', collegeId);
  const [{ data, error }, one] = await Promise.all([
    q,
    collegeId
      ? (db().from('colleges' as never) as any).select(COLLEGE_COLUMNS).eq('id', collegeId).maybeSingle()
      : Promise.resolve(null),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as (LinkRow & { colleges: College | null })[];
  const collegeIds = Array.from(new Set(rows.map((r) => r.college_id)));
  const pending = new Map<string, number>();
  if (collegeIds.length > 0) {
    const sub = await (db().from('college_content_submissions' as never) as any)
      .select('college_id')
      .eq('status', 'pending')
      .in('college_id', collegeIds)
      .limit(5000);
    // Counts are a convenience: a failure here must not hide the list.
    for (const r of (sub.data ?? []) as { college_id: string }[]) pending.set(r.college_id, (pending.get(r.college_id) ?? 0) + 1);
  }

  const now = new Date();
  const out = rows.map(({ colleges, ...r }) => ({
    ...withStatus(r, now),
    college: colleges,
    pending_reviews: pending.get(r.college_id) ?? 0,
  }));
  const body: Record<string, unknown> = { data: out };
  if (collegeId) body.college = (one?.data as College | null) ?? null;
  return NextResponse.json(body, { headers: noStore });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const checked = validateCreateLink(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const input = checked.value;

  const { data: college, error: collegeErr } = await (db().from('colleges' as never) as any)
    .select(COLLEGE_COLUMNS)
    .eq('id', input.college_id)
    .maybeSingle();
  if (collegeErr) return NextResponse.json({ error: collegeErr.message }, { status: 500 });
  if (!college) return NextResponse.json({ error: 'That college was not found.' }, { status: 404 });

  if (input.replace_link_id) {
    const { data: old, error: oldErr } = await links().select('id, college_id').eq('id', input.replace_link_id).maybeSingle();
    if (oldErr) return NextResponse.json({ error: oldErr.message }, { status: 500 });
    if (!old || old.college_id !== input.college_id) {
      return NextResponse.json({ error: 'The link to replace belongs to a different college.' }, { status: 400 });
    }
  }

  const staff = await resolveStaff(request, body);
  const token = newToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.expires_in_days * 86_400_000).toISOString();

  const { data: link, error } = await links()
    .insert({
      college_id: input.college_id,
      token_hash: hashToken(token),
      sections: input.sections,
      recipient_name: input.recipient_name,
      recipient_phone: input.recipient_phone,
      note: input.note,
      created_by: staff.name,
      created_at: now.toISOString(),
      expires_at: expiresAt,
    })
    .select(LINK_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Cancel the old link only once the new one exists, so a failure never leaves the college with neither.
  if (input.replace_link_id) {
    await links()
      .update({ revoked_at: now.toISOString(), revoked_by: staff.name })
      .eq('id', input.replace_link_id)
      .is('revoked_at', null);
  }

  const url = updateLinkUrl(marketingOriginFor(request.nextUrl.origin, process.env.NEXT_PUBLIC_MARKETING_URL), token);
  const message = buildMessage({
    recipientName: input.recipient_name,
    collegeName: (college as College).name,
    url,
    expiresAt,
    sections: input.sections,
  });
  return NextResponse.json(
    {
      link: { ...withStatus(link as LinkRow, now), college, pending_reviews: 0 },
      url,
      message,
      whatsapp_url: whatsappUrl(input.recipient_phone, message),
    },
    { status: 201, headers: noStore },
  );
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  const action = body?.action;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Unknown link.' }, { status: 400 });
  if (action !== 'extend' && action !== 'cancel') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });

  const { data: current, error: readErr } = await links().select(LINK_COLUMNS).eq('id', id).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: 'Link not found.' }, { status: 404 });
  const row = current as LinkRow;
  if (row.revoked_at) return NextResponse.json({ error: 'This link is already cancelled.' }, { status: 409 });

  const staff = await resolveStaff(request, body);
  const now = new Date();
  const patch =
    action === 'extend'
      ? { expires_at: extendedExpiry(row.expires_at, now) }
      : { revoked_at: now.toISOString(), revoked_by: staff.name };

  const { data: updated, error } = await links()
    .update(patch)
    .eq('id', id)
    .is('revoked_at', null)
    .select(LINK_COLUMNS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: 'This link is already cancelled.' }, { status: 409 });
  return NextResponse.json({ link: withStatus(updated as LinkRow, now) }, { headers: noStore });
}
