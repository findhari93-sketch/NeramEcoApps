export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import {
  getLifecycleRules,
  getSupabaseAdminClient,
  listAutoArchiveRuns,
  previewAutoArchive,
  runAutoArchiveNow,
  setAutoArchiveEnabled,
} from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';

/**
 * GET /api/lifecycle/auto-archive
 *   The People page status bar: is the nightly job on, what the next run would
 *   archive, and the latest runs.
 * GET /api/lifecycle/auto-archive?log=<runId|latest>
 *   The names behind one run (archived and came back), for the log drawer.
 */
export async function GET(request: NextRequest) {
  const log = request.nextUrl.searchParams.get('log');
  try {
    if (log) return NextResponse.json(await runLog(log));

    const [rules, preview, runs] = await Promise.all([getLifecycleRules(), previewAutoArchive(50), listAutoArchiveRuns(10)]);
    return NextResponse.json({
      enabled: Boolean(rules.auto_archive_enabled),
      rules: {
        earlier_season_idle_days: rules.earlier_season_idle_days,
        lead_archive_days: rules.lead_archive_days,
      },
      preview,
      // The latest run that did something (nightly runs while off are skipped).
      lastRun: runs.find((r) => !r.skipped) || null,
      runs,
    });
  } catch (error) {
    console.error('Auto-archive status error:', error);
    return NextResponse.json({ error: 'Could not load auto-archive.' }, { status: 500 });
  }
}

/**
 * POST /api/lifecycle/auto-archive
 *   { action: 'run' }                       archive now (and restore anyone back)
 *   { action: 'enable', enabled: boolean }  turn the nightly job on or off
 */
export async function POST(request: NextRequest) {
  const adminId = getRequestAdminId(request);
  if (!adminId) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    if (body.action === 'run') {
      const run = await runAutoArchiveNow(adminId);
      return NextResponse.json({ success: true, run });
    }
    if (body.action === 'enable' && typeof body.enabled === 'boolean') {
      const rules = await setAutoArchiveEnabled(body.enabled, adminId);
      return NextResponse.json({ success: true, enabled: rules.auto_archive_enabled });
    }
    return NextResponse.json({ error: "action must be 'run' or 'enable'." }, { status: 400 });
  } catch (error) {
    console.error('Auto-archive action error:', error);
    return NextResponse.json({ error: 'Could not run auto-archive.' }, { status: 500 });
  }
}

const PEOPLE_LIMIT = 500;

async function runLog(runId: string) {
  const admin: any = getSupabaseAdminClient();
  let query = admin.from('people_auto_archive_runs').select('*');
  query =
    runId === 'latest'
      ? query.eq('skipped', false).order('ran_at', { ascending: false }).limit(1)
      : query.eq('id', runId).limit(1);
  const { data: runs, error } = await query;
  if (error) throw error;
  const run = runs?.[0];
  if (!run) return { run: null, archived: [], restored: [] };

  const ids = [...run.archived_ids.slice(0, PEOPLE_LIMIT), ...run.restored_ids.slice(0, PEOPLE_LIMIT)];
  const people = new Map<string, any>();
  // Chunked: long .in() lists overflow the request URL.
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error: peopleError } = await admin
      .from('users')
      .select('id, name, email, lifecycle_status, archived_reason')
      .in('id', ids.slice(i, i + 150));
    if (peopleError) throw peopleError;
    for (const p of data || []) people.set(p.id, p);
  }
  const pick = (list: string[]) => list.slice(0, PEOPLE_LIMIT).map((id) => people.get(id)).filter(Boolean);
  return { run, archived: pick(run.archived_ids), restored: pick(run.restored_ids) };
}
