import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { escapeIlike, rankPeople } from '@/lib/people-search';

/**
 * GET /api/users/search?q={query}&exclude_classroom={classroomId}&include_directory=true
 *
 * Search for users by name or email.
 * When include_directory=true, also searches the Microsoft Entra ID organization directory.
 * Optionally exclude users already enrolled in a classroom.
 */
const MAX_RESULTS = 20;
const SEARCH_POOL = 200;

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    // Verify caller is teacher/admin
    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller || !['teacher', 'admin'].includes(caller.user_type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const q = request.nextUrl.searchParams.get('q')?.trim();
    const excludeClassroom = request.nextUrl.searchParams.get('exclude_classroom');
    const includeDirectory = request.nextUrl.searchParams.get('include_directory') === 'true';

    if (!q || q.length < 2) {
      return NextResponse.json({ users: [] });
    }

    // Search local users — only org users (those with ms_oid).
    // The pool is deliberately wider than MAX_RESULTS: the ilike matches the term
    // anywhere, and relevance is applied at the end, so ranking only the first 20
    // name-ordered rows could truncate a prefix match before promoting it.
    const safe = escapeIlike(q);
    const { data: localUsers, error } = await supabase
      .from('users')
      .select('id, name, email, avatar_url, ms_oid, user_type')
      .eq('status', 'active')
      .not('ms_oid', 'is', null)
      .or(`name.ilike.%${safe}%,email.ilike.%${safe}%`)
      .order('name')
      .limit(SEARCH_POOL);

    if (error) throw error;

    let results: any[] = (localUsers || []).map((u: any) => ({
      ...u,
      source: 'local',
    }));

    // If excluding a classroom, filter out already-enrolled users
    if (excludeClassroom && results.length > 0) {
      const userIds = results.map((u: any) => u.id);
      const { data: enrolled } = await supabase
        .from('nexus_enrollments')
        .select('user_id')
        .eq('classroom_id', excludeClassroom)
        .eq('is_active', true)
        .in('user_id', userIds);

      const enrolledIds = new Set((enrolled || []).map((e: any) => e.user_id));
      results = results.filter((u: any) => !enrolledIds.has(u.id));
    }

    // Search Microsoft Entra ID directory via Graph API
    if (includeDirectory) {
      try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (token) {
          const directoryUsers = await searchGraphDirectory(token, q);

          // Deduplicate: remove Graph results that already exist locally
          const localOids = new Set(results.map((u: any) => u.ms_oid).filter(Boolean));
          const newDirectoryUsers = directoryUsers.filter(
            (du: any) => !localOids.has(du.ms_oid)
          );

          // If excluding a classroom, also filter out directory users already enrolled
          if (excludeClassroom && newDirectoryUsers.length > 0) {
            const dirOids = newDirectoryUsers.map((u: any) => u.ms_oid);
            const { data: enrolledByOid } = await supabase
              .from('nexus_enrollments')
              .select('user_id, user:users!nexus_enrollments_user_id_fkey!inner(ms_oid)')
              .eq('classroom_id', excludeClassroom)
              .eq('is_active', true);

            const enrolledOids = new Set(
              (enrolledByOid || [])
                .map((e: any) => e.user?.ms_oid)
                .filter(Boolean)
            );

            const filteredDirUsers = newDirectoryUsers.filter(
              (u: any) => !enrolledOids.has(u.ms_oid)
            );
            results = [...results, ...filteredDirUsers];
          } else {
            results = [...results, ...newDirectoryUsers];
          }
        }
      } catch (graphErr) {
        // Graph API failure is non-fatal — return local results only
        console.warn('Graph directory search failed:', graphErr);
      }
    }

    // Rank last, so local and directory rows interleave by how well they match
    // rather than always local-then-directory. A local row still wins a tie,
    // since it carries an avatar, a user_type and a real users row.
    const ranked = rankPeople(results, q, (a, b) =>
      (a.source === 'local' ? 0 : 1) - (b.source === 'local' ? 0 : 1)
    ).slice(0, MAX_RESULTS);

    return NextResponse.json({ users: ranked });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed';
    console.error('User search error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Search Microsoft Entra ID directory for users matching a query.
 * Uses the caller's delegated token with User.ReadBasic.All scope.
 */
async function searchGraphDirectory(
  accessToken: string,
  query: string
): Promise<any[]> {
  // Sanitize query for OData filter (escape single quotes)
  const sanitized = query.replace(/'/g, "''").replace(/[#&%]/g, '');

  const filter = `startswith(displayName,'${sanitized}') or startswith(userPrincipalName,'${sanitized}')`;
  const select = 'id,displayName,mail,userPrincipalName';

  const url = `https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(filter)}&$select=${select}&$top=20`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    console.warn(`Graph API ${res.status}:`, errText);
    return [];
  }

  const data = await res.json();
  const graphUsers = data.value || [];

  return graphUsers.map((gu: any) => ({
    ms_oid: gu.id,
    name: gu.displayName || '',
    email: gu.mail || gu.userPrincipalName || '',
    avatar_url: null,
    source: 'directory',
  }));
}
