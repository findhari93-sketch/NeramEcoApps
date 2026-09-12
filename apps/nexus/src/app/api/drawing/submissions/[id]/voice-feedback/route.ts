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
 * Assignment drawings only, never exam drawings: an exam result is embargoed until
 * it is published, and practice drawings have no page the student plays it on.
 */

const MAX_BYTES = 10 * 1024 * 1024;

type Ctx = { params: Promise<{ id: string }> };

async function authorise(request: NextRequest, submissionId: string) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient() as any;

  const { data: user } = await supabase
    .from('users')
    .select('id, user_type')
    .eq('ms_oid', msUser.oid)
    .single();
  if (!user || !['teacher', 'admin'].includes(user.user_type ?? '')) {
    return { fail: NextResponse.json({ error: 'Not authorized' }, { status: 403 }) } as const;
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
    return { fail: NextResponse.json({ error: 'Submission not found' }, { status: 404 }) } as const;
  }
  if (!sub.assignment_id || sub.exam_attempt_id) {
    return {
      fail: NextResponse.json(
        { error: 'Voice feedback is only available on assignment drawings.' },
        { status: 400 },
      ),
    } as const;
  }
  return { user, sub } as const;
}

function failure(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : fallback;
  console.error(`Voice feedback: ${fallback}:`, message);
  const isAuth = /authorization|token|auth/i.test(message);
  return NextResponse.json({ error: isAuth ? message : fallback }, { status: isAuth ? 401 : 500 });
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const auth = await authorise(request, id);
    if ('fail' in auth) return auth.fail;

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

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const auth = await authorise(request, id);
    if ('fail' in auth) return auth.fail;

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

export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const auth = await authorise(request, id);
    if ('fail' in auth) return auth.fail;

    const removed = await deleteVoiceFeedback(id);
    return NextResponse.json({ ok: true, removed });
  } catch (err) {
    return failure(err, 'Could not delete the voice note');
  }
}
