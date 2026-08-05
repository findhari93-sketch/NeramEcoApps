import { NextRequest, NextResponse } from 'next/server';
import { verifyTeacher } from '@/lib/verify-teacher';
import { extractBearerToken } from '@/lib/ms-verify';
import {
  buildClassTestFromRecap,
  getRecapById,
  replaceRecapSections,
  setRecapReadiness,
  getSupabaseAdminClient,
} from '@neram/database';
import { generateSectionsAndQuestions } from '@/lib/ai-generate';
import { resolveTranscript } from '@/lib/transcript-resolver';
import { preflight, scoreRecapGeneration } from '@/lib/recap-quality';
import { readRecapDefaults, questionsToPass } from '@/lib/recap-defaults';
import { isUsableSection } from '@/lib/recap-autodraft';

/**
 * POST /api/class-recaps/[recapId]/autopublish
 *
 * Generate, save, grade, publish, and build the class test, in one press.
 *
 * The five-step version of this (create, generate, review, save, publish, then
 * a sixth button for the class test) is why production had nine recorded classes
 * and zero usable recaps: nobody presses six buttons per class. The old
 * /generate route only ever returned a PREVIEW, so a teacher who pressed
 * Generate and then Publish published nothing at all, which is exactly what
 * happened to the 12 July recap sitting live with no checkpoints.
 *
 * Same engine as the nightly sweep, with one difference that matters: the
 * transcript comes through the full resolver ladder with the teacher's own
 * Microsoft token. The cron deliberately reads only stored transcripts, because
 * falling through to Graph and SharePoint is a per-class network cost a nightly
 * sweep has no business paying. A teacher standing at the screen waiting is a
 * different trade, and it is the only way to prepare a class whose transcript
 * has not been synced yet.
 *
 * Never publishes something broken: the same hard checks hold here as hold the
 * cron, and a hold leaves the generated checkpoints saved so the teacher can fix
 * them by hand rather than starting again.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ recapId: string }> },
) {
  try {
    await verifyTeacher(request.headers.get('Authorization'));
    const { recapId } = await params;
    const msToken = extractBearerToken(request.headers.get('Authorization'));

    const recap = await getRecapById(recapId);
    if (!recap) return NextResponse.json({ error: 'Recap not found' }, { status: 404 });

    const supabase = getSupabaseAdminClient() as any;
    const body = await request.json().catch(() => ({}));

    const { entries: transcript, sharepointError } = await resolveTranscript({
      cls: {
        id: recap.scheduled_class_id || recap.id,
        transcript_url: recap.transcript_url,
        recording_url: recap.recording_url,
        teams_meeting_id: null,
      },
      msToken,
      vttContent: body.vtt_content,
      // Only cache back when there is a real class row to cache onto: an ad-hoc
      // recap has no scheduled class, and writing its id would target the wrong row.
      supabase: recap.scheduled_class_id ? supabase : undefined,
    });

    if (transcript.length === 0) {
      return NextResponse.json({ error: transcriptError(sharepointError) }, { status: 200 });
    }

    // Per-recap columns win; the classroom settings row fills the gaps. The old
    // /generate route passed none of these, so a teacher who changed the
    // checkpoint settings got a generation that ignored every one of them.
    const defaults = await readRecapDefaults(supabase);
    const targetSegmentSeconds = recap.target_segment_seconds ?? defaults.target_segment_seconds;
    const poolPerSegment = recap.question_pool_per_segment ?? defaults.question_pool_per_segment;
    const questionsToServe = Math.min(
      poolPerSegment,
      recap.questions_per_segment ?? defaults.questions_per_segment,
    );
    const passPercentage = recap.pass_percentage ?? defaults.pass_percentage;
    const durationSeconds =
      recap.video_duration_seconds ?? transcript[transcript.length - 1]?.end ?? 0;

    const pre = preflight(transcript, durationSeconds);
    if (!pre.ok) {
      return NextResponse.json({ published: false, held: true, summary: pre.detail }, { status: 200 });
    }

    const generated = await generateSectionsAndQuestions(transcript, recap.title, {
      feature: 'nexus.recap-questions',
      targetSegmentSeconds,
      poolPerSegment,
      durationSeconds,
    });

    const planned = generated.sections || [];
    const usable = planned.filter(isUsableSection);
    if (usable.length === 0) {
      return NextResponse.json(
        {
          published: false,
          held: true,
          summary: 'The model returned no usable checkpoints. Try again in a moment.',
        },
        { status: 200 },
      );
    }

    // Stamp the gate onto every checkpoint. NULL is not "unset" here: a NULL
    // questions_to_serve serves the whole bank of fifteen, and a NULL
    // min_questions_to_pass then demands all fifteen correct.
    const graded = usable.map((s) => ({
      ...s,
      questions_to_serve: Math.min(questionsToServe, (s.questions || []).length),
      min_questions_to_pass: questionsToPass(
        Math.min(questionsToServe, (s.questions || []).length),
        passPercentage,
      ),
    }));

    await replaceRecapSections(recapId, graded, supabase);

    // Graded against every PLANNED segment rather than the ones that survived,
    // so a thin generation reports "3 of 5 checkpoints have too few questions"
    // instead of the coverage failure it used to invent.
    const verdict = scoreRecapGeneration({
      sections: planned,
      transcript,
      durationSeconds,
      targetSegmentSeconds,
      questionsToServe,
    });

    // Before publishing, so a recap never goes live without the test that clears
    // the class. A recap with no scheduled class simply has no test to build,
    // which is a fact about ad-hoc recaps and not a failure.
    let classTest: { question_count: number; passing_pct: number } | null = null;
    let classTestWarning: string | null = null;
    if (verdict.publish) {
      try {
        const built = await buildClassTestFromRecap(recapId, { createdBy: null }, supabase);
        classTest = { question_count: built.question_count, passing_pct: built.passing_pct };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        classTestWarning =
          message === 'RECAP_HAS_NO_CLASS'
            ? 'This recap is not linked to a scheduled class, so it has no class test.'
            : `The class test could not be built: ${message}`;
        console.warn(`[recap ${recapId}] class test build failed:`, message);
      }
    }

    await setRecapReadiness(
      recapId,
      {
        readiness: verdict.publish ? 'ready' : 'held',
        publish: verdict.publish,
        hold_reason: verdict.holdReason,
        hold_detail: verdict.summary,
        quality_score: Number(verdict.score.toFixed(2)),
        quality_report: { checks: verdict.checks, summary: verdict.summary },
        bumpAttempts: true,
        currentAttempts: recap.generation_attempts ?? 0,
      },
      supabase,
    );

    return NextResponse.json({
      published: verdict.publish,
      held: !verdict.publish,
      flagged: verdict.flagged,
      holdReason: verdict.holdReason,
      summary: verdict.summary,
      score: verdict.score,
      sections: usable.length,
      questions: usable.reduce((n, s) => n + (s.questions || []).length, 0),
      classTest,
      classTestWarning,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to prepare this recap';
    if (message === 'Not authorized') return NextResponse.json({ error: message }, { status: 403 });
    if (message === 'RECAP_HAS_ATTEMPTS') {
      return NextResponse.json(
        {
          error:
            'Students have already worked through these checkpoints, so they cannot be replaced. Edit them by hand instead.',
        },
        { status: 409 },
      );
    }
    if (message.includes('GEMINI_API_KEY')) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
    }
    if (/429|Too Many Requests|quota|RESOURCE_EXHAUSTED/.test(message)) {
      return NextResponse.json(
        { error: 'AI rate limit reached. Wait about a minute and try again.' },
        { status: 429 },
      );
    }
    console.error('[recap autopublish] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Why the ladder came back empty, in words a teacher can act on. */
function transcriptError(sharepointError: string | null | undefined): string {
  if (sharepointError === 'NO_ACCESS') {
    return 'You do not have view access to this recording in SharePoint, so its transcript cannot be read.';
  }
  if (sharepointError === 'VIDEO_NOT_FOUND') {
    return 'Recording not found in SharePoint. The link may have moved.';
  }
  return 'No transcript available for this class yet. Once Teams has finished processing it, or upload the .vtt here, this will work.';
}
