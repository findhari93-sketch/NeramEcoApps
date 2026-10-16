// Public, non-localized unsubscribe endpoint for College Outreach emails.
// Linked from the compliance footer of every outreach email and from the
// List-Unsubscribe header (one-click POST). Resolves a college by its opaque
// `unsubscribe_token`, adds its contact address to email_suppression_list, and
// stamps colleges.unsubscribed_at. The admin send route hard-blocks any address
// present in the suppression list, so this is the authoritative opt-out path.
//
// Excluded from next-intl middleware via the matcher in src/middleware.ts.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { siteTokens } from '@neram/ui/site-tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SuppressResult {
  ok: boolean;
  collegeName?: string;
  alreadyDone?: boolean;
}

async function suppressByToken(token: string | null, source: string): Promise<SuppressResult> {
  if (!token) return { ok: false };
  // Cast to any: the generated Supabase types don't yet include the outreach
  // columns (admissions_email, unsubscribed_at) or the email_suppression_list
  // table. Same reason the admin outreach API routes use @ts-nocheck.
  const supabase = getSupabaseAdminClient() as any;

  const { data: college } = await supabase
    .from('colleges')
    .select('id, name, admissions_email, email, unsubscribed_at')
    .eq('unsubscribe_token', token)
    .maybeSingle();

  if (!college) return { ok: false };

  const c = college as {
    id: string;
    name: string;
    admissions_email: string | null;
    email: string | null;
    unsubscribed_at: string | null;
  };

  const email = (c.admissions_email || c.email || '').trim().toLowerCase();

  if (email) {
    // Select-then-insert keeps this idempotent and works with the lower(email)
    // functional unique index (which a PostgREST upsert onConflict cannot target).
    const { data: existing } = await supabase
      .from('email_suppression_list')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (!existing) {
      try {
        await supabase
          .from('email_suppression_list')
          .insert({ email, college_id: c.id, reason: 'unsubscribe', source });
      } catch {
        // Unique-index race: another request inserted the same address. Ignore.
      }
    }
  }

  if (!c.unsubscribed_at) {
    await supabase
      .from('colleges')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('id', c.id);
  }

  return { ok: true, collegeName: c.name, alreadyDone: Boolean(c.unsubscribed_at) };
}

/** The college name comes from the database; escape it before it goes into HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Utility pattern from the marketing design system (DESIGN_SYSTEM.md): a centred
// white card on the ground colour, 8px radius, one gold primary action. Colours
// come from siteTokens; this is a raw HTML response, so they are inlined.
function htmlPage(heading: string, message: string): string {
  const t = siteTokens;
  const font = `Inter,'Noto Sans Tamil',system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${heading} | Neram Classes</title>
<style>a:focus-visible{outline:${t.focusOutline};outline-offset:2px}.cta:hover{background:${t.gold300}}@media (prefers-reduced-motion:reduce){*{transition:none!important}}</style>
</head>
<body style="margin:0;background:${t.ground};color:${t.ink};font-family:${font};-webkit-font-smoothing:antialiased">
<main style="max-width:520px;margin:0 auto;padding:56px 16px">
<p style="margin:0 0 20px;text-align:center;font-family:${t.fontMono};font-size:12px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:${t.gold800}">Neram Classes</p>
<div style="background:${t.surface};border:1px solid ${t.line};border-radius:${t.radius}px;padding:36px 24px;text-align:center">
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;font-weight:800;color:${t.ink}">${heading}</h1>
<p style="margin:0;font-size:16px;line-height:1.6;color:${t.inkMuted}">${message}</p>
<p style="margin:28px 0 0"><a class="cta" href="https://neramclasses.com" style="display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;box-sizing:border-box;border-radius:${t.radius}px;background:${t.gold500};color:${t.navy900};font-size:16px;font-weight:700;text-decoration:none;transition:background-color 150ms ease">Go to neramclasses.com</a></p>
<p style="margin:24px 0 0;font-size:15px;line-height:1.6;color:${t.inkMuted}">Questions? Email <a href="mailto:info@neramclasses.com" style="color:${t.ink};text-decoration:underline;text-underline-offset:3px">info@neramclasses.com</a></p>
</div>
<p style="text-align:center;margin:18px 0 0;font-size:13px;color:${t.inkMuted}">Neram Classes, India's first architecture college hub</p>
</main>
</body>
</html>`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = new URL(req.url).searchParams.get('c');
  const result = await suppressByToken(token, 'link');

  const body = result.ok
    ? htmlPage(
        'You have been unsubscribed',
        `${escapeHtml(result.collegeName ?? 'This college')} will no longer receive outreach emails from us. If this was a mistake, just reply to our last email and we will add you back.`,
      )
    : htmlPage(
        'Unsubscribe',
        'We could not match this link to a college. To stop receiving our emails, reply to any of our messages with the word "unsubscribe" and we will remove you right away.',
      );

  return new NextResponse(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// RFC 8058 one-click unsubscribe: mail clients POST to the List-Unsubscribe URL.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = new URL(req.url).searchParams.get('c');
  await suppressByToken(token, 'one_click');
  return new NextResponse('Unsubscribed', {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}
