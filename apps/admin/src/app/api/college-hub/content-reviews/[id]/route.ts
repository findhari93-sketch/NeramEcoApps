export const dynamic = 'force-dynamic';

/**
 * PATCH /api/college-hub/content-reviews/:id { decision: 'approve' | 'reject', note? }
 *   approve: applies the payload (lib/college-content-submissions/apply.ts), stamps
 *            colleges.college_provided, then refreshes the public college page.
 *   reject:  needs a note.
 * -> { success, id, status, revalidated }. 409 when the submission is no longer pending.
 * Staff only (admin API middleware).
 */
import { NextRequest, NextResponse } from 'next/server';
import { DecisionError, decideSubmission } from '@/lib/college-content-submissions/runner';
import { revalidateCollegePage } from '@/lib/marketing-revalidate';
import { resolveStaff } from '@/lib/staff-actor';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Submission not found.' }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const decision = body?.decision;
  if (decision !== 'approve' && decision !== 'reject') {
    return NextResponse.json({ error: "decision must be 'approve' or 'reject'" }, { status: 400 });
  }
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 1000) : null;
  const staff = await resolveStaff(request, body);
  try {
    const result = await decideSubmission(params.id, decision, note, staff.name);
    const revalidated =
      result.status === 'approved' && result.college
        ? await revalidateCollegePage(result.college, { adminOrigin: request.nextUrl.origin })
        : false;
    return NextResponse.json({ success: true, id: result.id, status: result.status, revalidated });
  } catch (err) {
    if (err instanceof DecisionError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: (err as Error).message ?? 'Something went wrong.' }, { status: 500 });
  }
}
