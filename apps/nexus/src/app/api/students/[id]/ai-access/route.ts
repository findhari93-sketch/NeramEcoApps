import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { ApiError, describeError, httpStatusForError } from '@/lib/api-errors';
import { readAssistantGate } from '@/lib/assistant/access';
import { clearOverrides, loadAiAccess, setOverride, teacherAccessLine } from '@/lib/assistant/ai-access';
import { todayIst } from '@/lib/assistant/format';
import { isUuid } from '@/lib/assistant/ids';
import { assertStaffSeesStudent } from '@/lib/sketchbook-access';
import { getRequestUser } from '@/lib/study-materials';

export const dynamic = 'force-dynamic';

/**
 * GET    /api/students/[id]/ai-access   (staff) the student's AI answers status in teacher words
 * POST   body { mode: 'on'|'off', reason, ends_on? }   set an override (clears the active one, D10)
 * DELETE clear the active override
 *
 * Any staff member who teaches the student (assertStaffSeesStudent; admins see
 * everyone). 404 while the assistant flag is off, and for an id that is not a
 * student. A View-as-Student session resolves to the student and is refused.
 */
async function staffFor(request: NextRequest, studentId: string) {
  // A non-uuid can never be a real user; answer before any database call.
  if (!isUuid(studentId)) throw new ApiError('Not found', 404);
  const caller = await getRequestUser(request.headers.get('Authorization'));
  await assertStaffSeesStudent(caller, studentId);
  const supabase = getSupabaseAdminClient() as any;
  if (!(await readAssistantGate(supabase)).enabled) throw new ApiError('Not found', 404);
  const { data: student } = await supabase.from('users').select('id, user_type').eq('id', studentId).maybeSingle();
  if (!student || student.user_type !== 'student') throw new ApiError('Not found', 404);
  return { caller, supabase };
}

async function view(supabase: any, studentId: string) {
  const access = await loadAiAccess(supabase, studentId, new Date());
  const o = access.override;
  let setByName: string | null = null;
  if (o?.set_by) {
    const { data } = await supabase.from('users').select('name').eq('id', o.set_by).maybeSingle();
    setByName = data?.name ?? null;
  }
  return {
    on: access.on,
    line: teacherAccessLine(access),
    override: o ? { mode: o.mode, reason: o.reason, ends_on: o.ends_on, set_at: o.set_at, set_by_name: setByName } : null,
  };
}

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/**
 * Fixed sentences only. errorResponse would pass a PostgrestError's raw message
 * (table names, cast errors) to the client, so anything that is not an ApiError
 * or an auth failure is logged and answered generically.
 */
function fail(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status, headers: NO_STORE });
  }
  const status = httpStatusForError(err);
  if (status === 403) return NextResponse.json({ error: 'Not authorized' }, { status, headers: NO_STORE });
  if (status === 401) {
    return NextResponse.json({ error: 'Your session has ended. Sign in again.' }, { status, headers: NO_STORE });
  }
  console.error('[ai-access]', describeError(err));
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500, headers: NO_STORE });
}
const isYmd = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase } = await staffFor(request, params.id);
    return NextResponse.json(await view(supabase, params.id), { headers: NO_STORE });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { caller, supabase } = await staffFor(request, params.id);
    const body = await request.json().catch(() => ({}));
    const mode = body?.mode;
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    const endsOn = body?.ends_on ?? null;
    if (mode !== 'on' && mode !== 'off') throw new ApiError('Choose Always on or Always off.', 400);
    if (!reason) throw new ApiError('Give a reason, so other teachers know why.', 400);
    if (reason.length > 200) throw new ApiError('Keep the reason under 200 characters.', 400);
    if (endsOn !== null && (!isYmd(endsOn) || endsOn < todayIst(new Date()))) throw new ApiError('The end date must be today or later.', 400);
    await setOverride(supabase, { studentId: params.id, mode, reason, endsOn, setBy: caller.id, now: new Date() });
    return NextResponse.json(await view(supabase, params.id), { headers: NO_STORE });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { caller, supabase } = await staffFor(request, params.id);
    await clearOverrides(supabase, params.id, caller.id, new Date());
    return NextResponse.json(await view(supabase, params.id), { headers: NO_STORE });
  } catch (err) {
    return fail(err);
  }
}
