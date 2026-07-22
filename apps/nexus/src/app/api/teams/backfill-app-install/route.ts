import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { ensureTeamsAppInstalledForUser } from '@neram/auth';
import { getRequestUser, isAdmin } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';

/**
 * POST /api/teams/backfill-app-install  (admin)
 *
 * One-time: install the "Neram Assistant" Teams app in every enrolled student's
 * personal scope so assignment/study reminders can reach their Teams Activity feed.
 * Safe to re-run (already-installed is a no-op). Requires TEAMS_APP_CATALOG_ID and
 * the TeamsAppInstallation.ReadWriteForUser.All application permission with admin
 * consent. New enrollments install automatically (see addStudentToClassroomTeams),
 * and the send path installs lazily on demand, so this is for existing students.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    if (!isAdmin(user)) throw new ApiError('Not authorized', 403);

    const catalogAppId = process.env.TEAMS_APP_CATALOG_ID;
    if (!catalogAppId) {
      return NextResponse.json(
        { error: 'TEAMS_APP_CATALOG_ID is not configured. Upload the Teams app and set it first.' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdminClient() as any;
    // Distinct students with an active enrollment and a Microsoft identity.
    const { data: enr } = await supabase
      .from('nexus_enrollments')
      .select('user:users(id, ms_oid, name)')
      .eq('is_active', true);

    const seen = new Set<string>();
    const targets: { id: string; oid: string; name: string | null }[] = [];
    for (const row of (enr as any[]) || []) {
      const u = Array.isArray(row.user) ? row.user[0] : row.user;
      if (!u?.id || !u.ms_oid || seen.has(u.id)) continue;
      seen.add(u.id);
      targets.push({ id: u.id, oid: u.ms_oid, name: u.name ?? null });
    }

    let installed = 0;
    let alreadyInstalled = 0;
    let failed = 0;
    const failures: { name: string | null; reason?: string }[] = [];

    // Small concurrency to avoid Graph throttling. Idempotent, so a timeout can be
    // recovered simply by running it again.
    const CHUNK = 5;
    for (let i = 0; i < targets.length; i += CHUNK) {
      const batch = targets.slice(i, i + CHUNK);
      const rs = await Promise.all(
        batch.map((t) => ensureTeamsAppInstalledForUser(t.oid, catalogAppId).then((r) => ({ t, r }))),
      );
      for (const { t, r } of rs) {
        if (!r.ok) {
          failed++;
          failures.push({ name: t.name, reason: r.reason });
        } else if (r.alreadyInstalled) {
          alreadyInstalled++;
        } else {
          installed++;
        }
      }
    }

    return NextResponse.json({ total: targets.length, installed, alreadyInstalled, failed, failures });
  } catch (err) {
    return errorResponse(err, 'Backfill failed');
  }
}
