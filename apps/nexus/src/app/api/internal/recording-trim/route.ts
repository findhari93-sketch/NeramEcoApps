import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getSupabaseAdminClient } from '@neram/database';
import {
  applyReadyTrims,
  claimTrimJob,
  completeTrimJob,
  failTrimJob,
  openTrimUpload,
  planTrimJob,
  type CompleteReport,
  type PlanReport,
} from '@/lib/recording-trim';

/**
 * POST /api/internal/recording-trim
 *
 * The one door the recording-trim worker (a GitHub Actions runner,
 * scripts/recording-trim/worker.mjs) comes through. Body: { action, ... }.
 *
 *   claim        { run }                          the next job, or { job: null }
 *   plan         { job_id, report }               { keep } or { skip }
 *   upload       { job_id }                       { upload_url, file_name }
 *   complete     { job_id, report }               { status }
 *   fail         { job_id, reason, detail }       { ok }
 *   apply_ready  {}                               { applied, failed }
 *
 * Authorised by RECORDING_TRIM_TOKEN alone, compared in constant time. The
 * repository is public, so the worker masks every URL this returns in its logs.
 * Mutations only, so a route rather than a cached read; it runs a handful of
 * times a night.
 */

export const runtime = 'nodejs';
export const maxDuration = 120;

function authorised(request: NextRequest): boolean {
  const secret = process.env.RECORDING_TRIM_TOKEN;
  const header = request.headers.get('Authorization') || '';
  if (!secret || !header.startsWith('Bearer ')) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const supabase = getSupabaseAdminClient() as any;
  const jobId = typeof body.job_id === 'string' ? body.job_id : '';

  try {
    switch (body.action) {
      case 'claim':
        return NextResponse.json({ job: await claimTrimJob(supabase, String(body.run || 'manual').slice(0, 80)) });
      case 'plan':
        return NextResponse.json(await planTrimJob(supabase, jobId, body.report as PlanReport));
      case 'upload':
        return NextResponse.json(await openTrimUpload(supabase, jobId));
      case 'complete':
        return NextResponse.json(await completeTrimJob(supabase, jobId, body.report as CompleteReport));
      case 'fail':
        await failTrimJob(supabase, jobId, String(body.reason || 'WORKER_FAILED'), body.detail ? String(body.detail) : undefined);
        return NextResponse.json({ ok: true });
      case 'apply_ready':
        return NextResponse.json(await applyReadyTrims(supabase));
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Recording trim failed';
    console.error('[recording-trim]', body.action, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
