import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /a/<slug> — the short link a teacher pastes.
 *
 * Resolves an assignment's share_slug to its student page and redirects. Two
 * reasons this exists rather than sharing /student/assignments/<uuid> directly:
 * the UUID is 36 characters and mangles in most chat clients' link previews,
 * and it is our internal primary key, which does not belong in a message
 * forwarded around a class group.
 *
 * The redirect target is the ordinary student route, so every existing
 * protection still applies: RoleGuard bounces a signed-out visitor to sign in
 * (and, since return-path.ts, brings them back HERE afterwards), and the page
 * itself refuses a student who is not enrolled in the assignment's classroom.
 * This route deliberately adds no access check of its own, because it reveals
 * nothing: an unknown slug and a slug for someone else's classroom behave
 * identically.
 */

/**
 * Node runtime, deliberately, despite this being exactly the lightweight hop
 * the deployment rules would otherwise want on edge.
 *
 * `runtime = 'edge'` does not work here and the reason is not obvious: importing
 * getSupabaseAdminClient pulls in the whole @neram/database barrel, and one of
 * the modules it re-exports (utils/unsubscribe-token) imports Node's `crypto`.
 * Webpack cannot resolve that for the edge target, so the route fails to compile
 * and every shared link 500s. No Nexus route runs on edge for closely related
 * reasons; see the note in api/auth/parent/login.
 *
 * Cheap regardless: one indexed lookup on a unique column, then a redirect.
 */

/** Slugs are 8 lowercase hex characters. Anything else cannot match a row. */
const SLUG = /^[0-9a-f]{6,32}$/i;

export async function GET(request: NextRequest, { params }: { params: { code: string } }) {
  // Where an unresolvable link lands. Their own assignment list is the most
  // useful wrong answer: a stale link in a months-old Teams message still puts
  // the student somewhere they can find what they were looking for, which a
  // 404 does not.
  const fallback = new URL('/student/assignments', request.nextUrl.origin);

  const code = String(params.code || '').toLowerCase();
  if (!SLUG.test(code)) return NextResponse.redirect(fallback, 302);

  try {
    const supabase = getSupabaseAdminClient() as any;
    const { data } = await supabase
      .from('nexus_class_assignments')
      .select('id')
      .eq('share_slug', code)
      .maybeSingle();

    if (!data?.id) return NextResponse.redirect(fallback, 302);

    return NextResponse.redirect(
      new URL(`/student/assignments/${data.id}`, request.nextUrl.origin),
      302,
    );
  } catch {
    // A database blip must not turn a shared link into an error page. Send them
    // to their list, where the assignment is also reachable.
    return NextResponse.redirect(fallback, 302);
  }
}
