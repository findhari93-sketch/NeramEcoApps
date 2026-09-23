import { NextRequest, NextResponse } from 'next/server';
import { describeError, errorResponse } from '@/lib/api-errors';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getDrawingSubmissionById,
  getAssignmentDrawingHistory,
  getSubmissionTags,
  getExamDrawingMaxMarks,
  getInspirationItem,
  getInspirationItemsForSubmission,
  getQBPracticeOrigins,
  listLiveFeatures,
  type QBPracticeOrigin,
} from '@neram/database/queries/nexus';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getVoiceFeedbackForSubmissions,
  removeVoiceFilesForSubmission,
  signVoiceFeedback,
} from '@/lib/drawing-voice-feedback';
import { heldIdsFrom, isReleasedForStudent, withholdUnreleasedReview } from '@/lib/student-drawing-payload';
import { loadManualEvaluations } from '@/lib/student-drawing-payload-server';
import { reviewKindOf } from '@/lib/drawing-source';
import { displayTitle } from '@/lib/inspiration-present';

/** The public drawing buckets a submission's images can live in. */
const DRAWING_IMAGE_BUCKETS = new Set(['drawing-uploads', 'drawing-reviewed', 'drawing-references']);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await params;
    const supabase = getSupabaseAdminClient() as any;

    const [{ data: viewer }, submission] = await Promise.all([
      supabase.from('users').select('id, user_type').eq('ms_oid', msUser.oid).maybeSingle(),
      getDrawingSubmissionById(id),
    ]);
    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    // Staff, or the student whose drawing this is. Anyone else signed in used to
    // be able to read any submission by id. A 404 rather than a 403, so a guessed
    // id cannot confirm that another student's work exists.
    const studentId = (submission as any).student_id as string | null;
    const isStaffViewer = !!viewer && ['teacher', 'admin'].includes(viewer.user_type ?? '');
    const isOwner = !!viewer && !!studentId && viewer.id === studentId;
    if (!isStaffViewer && !isOwner) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    // For an assignment drawing, also return every prior attempt so the review
    // screen can show the redo history (image + feedback per round). Practice
    // drawings (no assignment_id) have no assignment-scoped history.
    let attempts: any[] = [];
    const assignmentId = (submission as any).assignment_id;
    if (assignmentId && studentId) {
      attempts = await getAssignmentDrawingHistory(assignmentId, studentId);
    }

    const submissionIds = Array.from(new Set([id, ...attempts.map((a) => a.id)]));
    const [tags, voiceRows, profile, evaluations] = await Promise.all([
      // The review screen fills its tag editor from these. Without them it opened
      // empty and every save sent an empty list, which deleted the tags.
      getSubmissionTags(id).catch(() => []),
      // A student only ever hears a note that was sent; a draft is the teacher's.
      getVoiceFeedbackForSubmissions(submissionIds, { sentOnly: !isStaffViewer }).catch((e) => {
        console.error('Voice feedback load failed:', e?.message || e);
        return [];
      }),
      isStaffViewer && studentId
        ? supabase.from('student_profiles').select('ms_teams_email').eq('user_id', studentId).maybeSingle()
        : Promise.resolve({ data: null }),
      // Only the student view needs to know what is still held.
      isStaffViewer ? Promise.resolve([]) : loadManualEvaluations(supabase, submissionIds),
    ]);

    // The owner sees a review only once it is handed back: a draft save or a held
    // review writes it onto the row while the status still says submitted.
    const heldIds = heldIdsFrom(evaluations);
    const visibleVoiceRows = isStaffViewer
      ? voiceRows
      : voiceRows.filter((v) => {
          const row = v.submission_id === id ? submission : attempts.find((a) => a.id === v.submission_id);
          return !!row && isReleasedForStudent(row as any, heldIds);
        });
    const voices = await signVoiceFeedback(visibleVoiceRows);
    const voiceBySubmission = Object.fromEntries(voices.map((v) => [v.submission_id, v]));

    // What the one review screen needs beyond the row: the Show in Inspiration
    // switch, the Inspiration drawing this was practised from, whether it is
    // featured in a class, and a test drawing's marks ceiling. exam_attempt_id
    // and exam_qb_question_id are read off the select('*') row, never named in a
    // select, because staging has neither column.
    const row = submission as any;
    const kind = reviewKindOf(row);
    const itemId = (row.inspiration_item_id as string | null) ?? null;
    const [inspiration, practisedFrom, featured, examMaxMarks, qbOrigins] = await Promise.all([
      isStaffViewer && kind !== 'test' ? getInspirationItemsForSubmission(id).catch(() => null) : Promise.resolve(null),
      itemId && viewer
        ? getInspirationItem(itemId, viewer.id, isStaffViewer ? 'all' : 'visible').then((r) => r.item).catch(() => null)
        : Promise.resolve(null),
      isStaffViewer && kind === 'practice' ? listLiveFeatures([id]).then((f) => f[id] ?? []).catch(() => []) : Promise.resolve([]),
      isStaffViewer && kind === 'test' && row.exam_attempt_id && row.exam_qb_question_id
        ? getExamDrawingMaxMarks(row.exam_attempt_id, row.exam_qb_question_id).catch(() => null)
        : Promise.resolve(null),
      // Which bank question this was practised from, and therefore whether the
      // "Drawn with the solution open" chip has anything to point at. Best
      // effort: a review screen that will not load because a caption lookup
      // failed is worse than a review screen with no caption.
      row.source_type === 'question_bank' && row.question_id
        ? getQBPracticeOrigins([row.question_id]).catch(() => ({}) as Record<string, QBPracticeOrigin>)
        : Promise.resolve({} as Record<string, QBPracticeOrigin>),
    ]);

    return NextResponse.json({
      submission: isStaffViewer
        ? { ...submission, tags }
        : { ...withholdUnreleasedReview(submission as any, heldIds), tags },
      attempts: isStaffViewer ? attempts : attempts.map((a) => withholdUnreleasedReview(a, heldIds)),
      voice_feedback: voiceBySubmission[id] ?? null,
      voice_by_submission: voiceBySubmission,
      // Staff only: lets the review screen open the Teams chat with this student.
      student_teams_email: isStaffViewer
        ? (profile as any)?.data?.ms_teams_email || (submission as any).student?.email || null
        : null,
      inspiration: isStaffViewer ? inspiration : null,
      practised_from: practisedFrom
        ? { item_id: practisedFrom.id, title: displayTitle(practisedFrom), image_url: practisedFrom.thumbnail_url || practisedFrom.image_url }
        : null,
      featured,
      exam_max_marks: examMaxMarks,
      // The bank question behind a practice drawing, and what the student had
      // open while they drew it. Both go to the student as well as the teacher:
      // a record only one side can see is a record the other cannot argue with.
      practised_from_qb: (row.question_id && qbOrigins[row.question_id as string]) || null,
      qb_help_used: (row.qb_help_used as string[] | null) ?? null,
    });
  } catch (err) {
    console.error('Submission GET error:', describeError(err));
    return errorResponse(err, 'Failed to load submission');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await params;
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type ?? '')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Fetch image URLs before deleting
    const { data: submission } = await supabase
      .from('drawing_submissions')
      .select('original_image_url, reviewed_image_url, corrected_image_url')
      .eq('id', id)
      .single();

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    // The voice note row goes with the submission by cascade; its audio file
    // would not, so remove it while the row still says where it is.
    await removeVoiceFilesForSubmission(id);

    // Delete the row (cascades to comments, notifications, voice feedback)
    const { error: deleteError } = await supabase
      .from('drawing_submissions')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    // Best-effort: delete associated storage files. The bucket is read from the
    // URL itself. It used to be guessed, and the guess named a bucket that does
    // not exist, so every original image was left behind.
    const urlsToDelete = [
      submission.original_image_url,
      submission.reviewed_image_url,
      submission.corrected_image_url,
    ].filter(Boolean) as string[];

    for (const url of urlsToDelete) {
      try {
        const match = url.match(/\/object\/public\/([^/]+)\/(.+)$/);
        if (!match || !DRAWING_IMAGE_BUCKETS.has(match[1])) continue;
        await supabase.storage.from(match[1]).remove([decodeURIComponent(match[2])]);
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Submission DELETE error:', describeError(err));
    return errorResponse(err, 'Delete failed');
  }
}
