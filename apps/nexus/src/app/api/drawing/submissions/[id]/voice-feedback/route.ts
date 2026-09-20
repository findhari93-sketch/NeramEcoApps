import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getSupabaseAdminClient } from '@neram/database';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  RECORDING_CAP_MS,
  RECORDING_MIN_MS,
  isAllowedVoiceMime,
  isVoiceNotePathFor,
  voiceNotePath,
} from '@/lib/voice-recording';
import { validateTimeline } from '@/lib/sketch-timeline';
import { reviewKindOf } from '@/lib/drawing-source';
import { describeError, httpStatusForError, messageOf } from '@/lib/api-errors';
import {
  createVoiceUploadUrl,
  deleteVoiceFeedback,
  saveVoiceDraft,
  signVoiceFeedback,
  voiceObjectExists,
} from '@/lib/drawing-voice-feedback';

/**
 * Voice feedback for one drawing attempt, recorded on the teacher review screen.
 *
 *   POST    { mime, size_bytes }                     -> a signed upload URL
 *   PUT     { path, mime, duration_ms, size_bytes }  -> saves it as the draft note
 *   DELETE                                            -> removes the note and its audio
 *
 * The audio never passes through this function. The browser uploads it straight
 * to the private bucket with the URL POST returns, then PUT records it. The path
 * is minted here and re-checked on PUT, so a browser cannot point a row at a file
 * under another student's submission.
 *
 * A saved note is a draft. It reaches the student with the next Redo or Complete
 * (see the review route), so recording never messages anybody on its own.
 *
 * Every drawing except a test. A test result is embargoed until it is published,
 * so a note recorded against one could reach a student before their marks do.
 *
 * Assignment drawings AND practice (a sketch, question bank, free practice): the
 * gate used to read `!sub.assignment_id`, which refused every sketch, so the one
 * thing a drawing teacher most wants to do, talk over a student's practice, was
 * the one thing the app would not let them do. The kind is decided by
 * reviewKindOf, never by reading exam_attempt_id: staging has no such column.
 */

const MAX_BYTES = 10 * 1024 * 1024;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Tagged, rather than "does it have a `fail` key".
 *
 * `{ fail } | { user, sub }` reads fine, but TypeScript gives the second member
 * an implicit `fail?: undefined`, so `'fail' in auth` does not rule it out and
 * `auth.fail` is `NextResponse | undefined`. Every handler here therefore
 * returned `NextResponse | undefined`, which nothing noticed until a test tried
 * to read `.status` off one.
 */
/** What this route reads off the drawing. The row is fetched whole; see below. */
interface VoiceSubmission {
  id: string;
  student_id: string;
  source_type: string | null;
  assignment_id: string | null;
  original_image_url: string | null;
  [column: string]: unknown;
}

type Authorised =
  | { ok: false; response: NextResponse }
  | { ok: true; user: { id: string; user_type: string | null }; sub: VoiceSubmission };

async function authorise(request: NextRequest, submissionId: string): Promise<Authorised> {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient() as any;

  const { data: user } = await supabase
    .from('users')
    .select('id, user_type')
    .eq('ms_oid', msUser.oid)
    .single();
  if (!user || !['teacher', 'admin'].includes(user.user_type ?? '')) {
    return { ok: false, response: NextResponse.json({ error: 'Not authorized' }, { status: 403 }) };
  }

  // The whole row, not a column list. Staging has no exam_attempt_id column, and
  // PostgREST answers a missing column with an error and no rows, which reached
  // the teacher as "Submission not found" while the drawing loaded fine beside it.
  // A real failure is raised rather than disguised as a missing submission.
  const { data: sub, error: subError } = await supabase
    .from('drawing_submissions')
    .select('*')
    .eq('id', submissionId)
    .maybeSingle();
  if (subError) {
    throw new Error(`Could not load the drawing: ${subError.message}`);
  }
  if (!sub) {
    return { ok: false, response: NextResponse.json({ error: 'Submission not found' }, { status: 404 }) };
  }
  if (reviewKindOf(sub) === 'test') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Voice feedback is not available on test drawings.' },
        { status: 400 },
      ),
    };
  }
  return { ok: true, user, sub };
}

/**
 * A caught error, with the status it deserves.
 *
 * The test was `/authorization|token|auth/i` against the message, so a Postgres
 * complaint about a column named `authored_by` answered 401 and sent the teacher
 * to the login screen over a schema problem. httpStatusForError classifies the
 * auth helpers' own messages instead of guessing from a substring.
 *
 * A 500 still answers with the fallback, not the raw message: what breaks in here
 * is storage, and its errors name buckets and paths.
 */
function failure(err: unknown, fallback: string) {
  console.error(`Voice feedback: ${fallback}:`, describeError(err));
  const status = httpStatusForError(err);
  return NextResponse.json({ error: status === 500 ? fallback : messageOf(err, fallback) }, { status });
}

export async function POST(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await authorise(request, id);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}) as any);
    const mime = String(body?.mime || '');
    const size = Number(body?.size_bytes);
    if (!isAllowedVoiceMime(mime)) {
      return NextResponse.json({ error: 'That recording format is not supported.' }, { status: 400 });
    }
    if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
      return NextResponse.json({ error: 'That recording is too large.' }, { status: 400 });
    }

    const upload = await createVoiceUploadUrl(voiceNotePath(id, randomUUID(), mime));
    return NextResponse.json(upload);
  } catch (err) {
    return failure(err, 'Could not start the upload');
  }
}

export async function PUT(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await authorise(request, id);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}) as any);
    const path = String(body?.path || '');
    const mime = String(body?.mime || '');
    const duration = Number(body?.duration_ms);
    const size = Number(body?.size_bytes);

    if (!isVoiceNotePathFor(id, path) || !isAllowedVoiceMime(mime)) {
      return NextResponse.json({ error: 'That recording does not belong to this drawing.' }, { status: 400 });
    }
    if (!Number.isFinite(duration) || duration < RECORDING_MIN_MS) {
      return NextResponse.json({ error: 'That recording is too short.' }, { status: 400 });
    }
    if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
      return NextResponse.json({ error: 'That recording is too large.' }, { status: 400 });
    }
    if (!(await voiceObjectExists(path))) {
      return NextResponse.json({ error: 'The recording did not finish uploading. Try again.' }, { status: 409 });
    }

    // "Talk while you sketch": the pen strokes, on the same clock as the voice.
    // Checked here rather than trusted, because it is stored as JSONB and later
    // drawn onto a canvas in the student's browser.
    let sketch = null;
    if (body?.sketch != null) {
      sketch = validateTimeline(body.sketch);
      if (!sketch) {
        return NextResponse.json({ error: 'That sketch could not be read.' }, { status: 400 });
      }
    }

    const row = await saveVoiceDraft({
      submissionId: id,
      studentId: auth.sub.student_id,
      authorId: auth.user.id,
      path,
      mime,
      // The recorder stops itself at the cap, a few milliseconds late at worst.
      durationMs: Math.min(Math.round(duration), RECORDING_CAP_MS),
      sizeBytes: Math.round(size),
      baseImageUrl: auth.sub.original_image_url ?? null,
      sketch,
    });
    const [view] = await signVoiceFeedback([row]);
    return NextResponse.json({ voice_feedback: view });
  } catch (err) {
    return failure(err, 'Could not save the voice note');
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await authorise(request, id);
    if (!auth.ok) return auth.response;

    const removed = await deleteVoiceFeedback(id);
    return NextResponse.json({ ok: true, removed });
  } catch (err) {
    return failure(err, 'Could not delete the voice note');
  }
}
