import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  applyTestDraw,
  getSupabaseAdminClient,
  getComposedTestQuestions,
  getPlacementById,
  getStudyVideoState,
  getTestMeta,
  saveAttemptAnswers,
  startOrResumeAttempt,
  submitAttempt,
  getExam,
  getExamMakeup,
  resolveExamWindowForStudent,
  getExamAttemptOverride,
  resolveExamTimer,
  getLiveAccessRequest,
  resolveTestRunWindow,
  loadAttendanceAndAbsences,
  listRunCoveredClasses,
} from '@neram/database';
import {
  decideCatchupGate,
  describeCatchupGate,
  type CatchupGateDecision,
  type GateClassEvidence,
} from '@/lib/catchup-test-gate';
import { attemptSeed, seededShuffle } from '@/lib/seeded-shuffle';
import { describeLiveRun, findLiveRunForStudent } from '@/lib/live-run';
import { stripPartSolutions } from '@/lib/drawing-parts';

/**
 * The student take engine.
 *
 * Both methods now delegate to the shared attempt lifecycle in
 * test-repository.ts. This route used to carry its own grader (plain string
 * equality, no numerical tolerance, no exclusion of ungradable questions) and
 * its own attempt bookkeeping, which is how two engines came to disagree about
 * the same paper.
 *
 * The 409 on a second submission is gone with it. A student may sit a test as
 * often as they like; each go is its own attempt row with its own number, and
 * a placement that genuinely wants one shot sets gating.attempt_limit.
 */

/** Map a domain error onto the status and sentence the client should show. */
function attemptError(message: string): NextResponse | null {
  switch (message) {
    case 'TEST_NOT_FOUND':
      return NextResponse.json({ error: 'Test not found or not available' }, { status: 404 });
    case 'TEST_HAS_NO_QUESTIONS':
      return NextResponse.json({ error: 'This test has no questions yet' }, { status: 400 });
    case 'ATTEMPT_LIMIT_REACHED':
      return NextResponse.json(
        { error: 'You have used all your attempts at this test.', code: 'ATTEMPT_LIMIT_REACHED' },
        { status: 403 },
      );
    case 'ATTEMPT_NOT_FOUND':
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
    case 'ATTEMPT_NOT_OPEN':
    case 'ATTEMPT_ALREADY_SUBMITTED':
      return NextResponse.json(
        { error: 'This attempt is already finished. Start a new one to try again.', code: 'ATTEMPT_CLOSED' },
        { status: 409 },
      );
    case 'PLACEMENT_TEST_MISMATCH':
      return NextResponse.json({ error: 'That test does not belong here' }, { status: 400 });
    // A refusal, not a crash. Unmapped, it went out as a 500 with the bare code.
    case 'EXAM_CLOSED':
      return NextResponse.json(
        {
          error: 'This exam closed before your paper was submitted. You can ask your teacher for another sitting.',
          code: 'EXAM_CLOSED',
        },
        { status: 403 },
      );
    default:
      return null;
  }
}

async function resolveUser(request: NextRequest) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient();
  const { data: user } = await supabase.from('users').select('id').eq('ms_oid', msUser.oid).single();
  return user as { id: string } | null;
}

/**
 * GET /api/tests/attempt?test_id={id}&placement_id={id}
 * Start or resume an attempt. Returns the test, its questions and the attempt.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await resolveUser(request);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const testId = request.nextUrl.searchParams.get('test_id');
    const placementId = request.nextUrl.searchParams.get('placement_id');
    if (!testId) return NextResponse.json({ error: 'Missing test_id' }, { status: 400 });

    // Practice on something already finished. Only 'revision' is honoured and
    // anything else is an official attempt, because the mode is stamped on the
    // attempt row here and read back off it at submit: a client cannot decide
    // after the fact that the paper it just failed was only practice.
    const mode = request.nextUrl.searchParams.get('mode') === 'revision' ? 'revision' : 'official';

    const test = await getTestMeta(testId);
    if (!test || !test.is_active || !test.is_published) {
      return NextResponse.json({ error: 'Test not found or not available' }, { status: 404 });
    }

    // Gated kinds are refused outright. A catch-up test is composed published
    // and with a classroom, so it used to be openable here, which skipped its
    // unlock check entirely. They have their own routes that re-derive the gate.
    const testKind = (test as any).test_kind as string | undefined;
    if (testKind === 'class_prep' || testKind === 'catchup_class') {
      return NextResponse.json(
        { error: 'Open this test from the class it belongs to.', code: 'WRONG_ENGINE' },
        { status: 403 },
      );
    }

    const now = new Date();
    if (test.available_from && new Date(test.available_from) > now) {
      return NextResponse.json({ error: 'Test is not yet available' }, { status: 403 });
    }
    if (test.available_until && new Date(test.available_until) < now) {
      return NextResponse.json({ error: 'Test has expired' }, { status: 403 });
    }

    // Populated only inside the exam branch below. Every other context_type
    // leaves these at their defaults, which is what makes an ordinary,
    // non-exam test completely unaffected by proctoring/attempt overrides/timer.
    let proctoring: { enabled: boolean; violation_limit: number } | null = null;
    let extraAttempts = 0;
    // Set by whichever door resolved a live per-student grant. A teacher who
    // opened the test has already decided this student may sit it, so the
    // catch-up gate below must not second-guess them.
    let holdsGrant = false;
    let examForTimer: Awaited<ReturnType<typeof getExam>> = null;
    // Which door this sitting comes through. Null for a paper opened without one.
    let doorContext: string | null = null;

    // A placement carries its own window and visibility on top of the test's.
    if (placementId) {
      const placement = await getPlacementById(placementId);
      if (placement && placement.test_id === testId) {
        doorContext = String(placement.context_type);
        if (!placement.is_active || !placement.is_visible) {
          return NextResponse.json({ error: 'This test is not available' }, { status: 403 });
        }

        /**
         * An exam resolves its own window BEFORE the generic check below, and
         * this ordering is load-bearing.
         *
         * The shared placement closes at the main closes_at. A student who has
         * been granted a makeup is sitting a DIFFERENT window, so running the
         * generic available_until check first would refuse every makeup student
         * before their own grant was ever read. That bug would look like "the
         * makeup feature does nothing", which is exactly the kind of thing that
         * is only discovered by the student it happens to.
         *
         * The copy matters too: a closed exam is not an expired link, it is an
         * exam this student was absent for, and the code says so.
         */
        if (placement.context_type === 'exam') {
          // context_id on an exam placement is the scheduled_class_id, not the
          // exam's own id -- gating.exam_id is the one field that always names
          // the exam directly (see the same fix in attempt/violation/route.ts).
          const examId = (placement.gating as { exam_id?: string } | null)?.exam_id;
          const exam = examId ? await getExam(examId) : null;
          examForTimer = exam;
          if (exam) {
            // A live makeup sitting resolves to this SAME exam row, so
            // proctoring_enabled already covers it with no extra plumbing.
            proctoring = { enabled: exam.proctoring_enabled, violation_limit: exam.violation_limit };
            const override = await getExamAttemptOverride(exam.id, user.id);
            extraAttempts = override?.extra_attempts || 0;

            /**
             * A reopened student is read here alongside their makeup.
             *
             * Without this line the teacher's "Open for them" button wrote a
             * granted row that nothing ever read: the roster showed a live
             * window, the student was still refused, and every screen the
             * teacher could see said it had worked.
             */
            const [makeup, grant] = await Promise.all([
              getExamMakeup(exam.id, user.id),
              getLiveAccessRequest(placement.id, user.id).catch(() => null),
            ]);
            const liveGrant = grant?.status === 'granted' ? grant : null;
            const window = resolveExamWindowForStudent(exam, makeup, liveGrant);

            if (new Date(window.opens_at) > now) {
              return NextResponse.json(
                {
                  error: `This exam opens at ${new Date(window.opens_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.`,
                  code: 'EXAM_NOT_OPEN',
                },
                { status: 403 },
              );
            }
            if (new Date(window.closes_at) < now) {
              const asked = grant?.status === 'pending';
              return NextResponse.json(
                {
                  error: asked
                    ? 'This exam has closed. Your teacher has your request.'
                    : 'This exam has closed. You can ask your teacher for another sitting.',
                  code: 'EXAM_CLOSED',
                  can_request: !asked,
                },
                { status: 403 },
              );
            }

            /**
             * A reopen is worth exactly one more sitting.
             *
             * An exam is sat once, so a window on its own would refuse anyone
             * who had already attempted -- which is precisely who a teacher
             * reopens it for. The limit re-binds as soon as this sitting is
             * used, so one grant stays one sitting rather than an open door.
             */
            if (liveGrant) {
              extraAttempts += 1;
              holdsGrant = true;
            }
          }
        } else if (placement.context_type === 'class_test') {
          /**
           * A class test resolves its own window BEFORE the generic check, for
           * exactly the reason the exam branch above does.
           *
           * The shared placement closes at its due date. A student let back in
           * by catch-up, by a teacher, or by an approved request is sitting a
           * DIFFERENT window, so running the generic available_until check
           * first would refuse every reopened student before their grant was
           * ever read. That bug looks like "the reopen feature does nothing".
           *
           * The copy matters too: a closed class test is not a dead link, it is
           * a door the student can ask to have opened, and the code says so.
           */
          const grant = await getLiveAccessRequest(placement.id, user.id);
          const window = resolveTestRunWindow({
            opensAt: placement.available_from ?? null,
            closesAt: placement.available_until ?? null,
            grant: grant?.status === 'granted' ? grant : null,
            now: now.getTime(),
          });

          holdsGrant = window.via_grant;

          if (!window.open) {
            if (window.reason === 'not_yet') {
              return NextResponse.json({ error: 'This test is not open yet' }, { status: 403 });
            }
            const asked = grant?.status === 'pending';
            return NextResponse.json(
              {
                error:
                  window.reason === 'grant_expired'
                    ? 'The extra time your teacher gave you has run out. You can ask again.'
                    : asked
                      ? 'This class test has closed. Your teacher has your request.'
                      : 'This class test has closed. You can ask your teacher to reopen it.',
                code: 'CLASS_TEST_CLOSED',
                can_request: !asked,
              },
              { status: 403 },
            );
          }
        } else {
          if (placement.available_from && new Date(placement.available_from) > now) {
            return NextResponse.json({ error: 'This test is not open yet' }, { status: 403 });
          }
          if (placement.available_until && new Date(placement.available_until) < now) {
            return NextResponse.json({ error: 'This test has closed' }, { status: 403 });
          }
        }

        /**
         * Catch up first, then sit the test.
         *
         * A test set after a lecture assumes the lecture happened. A student who
         * was absent and has not caught up would be answering on material they
         * have not met, so the score would measure the gap rather than the
         * student, and it would land on their record as if it measured them.
         *
         * Skipped entirely for a student holding a live grant: a teacher who
         * opened the door deliberately has already answered this question, and
         * re-asking it here would overrule them with a rule they never saw.
         *
         * decideCatchupGate blocks only on POSITIVE evidence of an un-caught-up
         * absence. A missing attendance row opens the door. See its header for
         * why that asymmetry is load-bearing rather than lenient.
         */
        if (CLASS_ANCHORED_FOR_GATE.has(String(placement.context_type)) && !holdsGrant) {
          const gate = await resolveCatchupGate(placement, user.id);
          if (gate.blocked) {
            return NextResponse.json(
              {
                error: describeCatchupGate(gate),
                code: 'CATCHUP_REQUIRED',
                outstanding: gate.outstanding,
              },
              { status: 403 },
            );
          }
        }

        /**
         * A chapter test is gated on its recording, and the gate has to be
         * asserted here as well as on the chapter's own route.
         *
         * class_prep and catchup_class are refused outright above precisely
         * because opening them through this engine skipped their unlock check.
         * study_file only escaped that list because it had no gate of its own
         * until the language tracks shipped. Now that a chapter can require a
         * recording, and now that the chapter test opens in this player rather
         * than in its old dialog, this URL would otherwise be the way past it.
         *
         * The chapter's own POST re-asserts the same thing. A GET refusing is
         * a hint to the UI; keeping the attempt row out of the database is the
         * part that counts.
         */
        if (placement.context_type === 'study_file') {
          const video = await getStudyVideoState(placement.context_id, user.id);
          if (video.requires_video && !video.video_completed_at) {
            return NextResponse.json(
              {
                error: 'Watch one of the class recordings before taking this test.',
                code: 'VIDEO_REQUIRED',
              },
              { status: 403 },
            );
          }
          // Refused rather than quietly downgraded to an official attempt: a
          // client that got this wrong would cost the student a real one.
          if (mode === 'revision' && !video.completed_at) {
            return NextResponse.json(
              {
                error: 'Revision opens once you have completed this chapter.',
                code: 'NOT_COMPLETED',
              },
              { status: 403 },
            );
          }
        }
      }
    }

    // A practice door never stands in for a live exam. While this paper is the
    // student's exam (or class test) and they have not sat it, they are sent
    // there instead. See lib/live-run.ts for what happened on 18 Aug.
    if (mode === 'official' && !CLASS_ANCHORED_FOR_GATE.has(String(doorContext))) {
      const live = await findLiveRunForStudent({ testId, studentId: user.id });
      if (live) return NextResponse.json(describeLiveRun(live), { status: 409 });
    }

    const started = await startOrResumeAttempt({ testId, studentId: user.id, placementId, mode, extraAttempts });
    // Cut to this sitting's draw when the test is a pool: the drawn questions,
    // in the drawn order, with their options permuted and relabelled. A test
    // without a pool comes back whole, which is what all of them did before.
    const composed = applyTestDraw(await getComposedTestQuestions(testId, false), started.draw);

    // Shape kept as the take page already expects it.
    let questions = composed.map((q) => ({
      id: q.test_question_id,
      sort_order: q.sort_order,
      marks: q.marks,
      // The real penalty, not a hardcoded 0. A student sitting an exam-faithful
      // paper has to be told what a wrong answer costs before they answer it,
      // otherwise the paper is testing a rule it never showed them.
      negative_marks: q.negative_marks,
      section: q.section,
      section_order: q.section_order,
      qb_question_id: q.question_id,
      question_id: q.question_id,
      question: {
        id: q.question_id,
        question_text: q.question_text,
        question_image_url: q.question_image_url,
        question_type: q.question_format,
        options: q.options,
        // Already stripped of solutions where it was read; stripped again here
        // because this is the door to the student.
        drawing_parts: stripPartSolutions(q.drawing_parts),
      },
    }));
    // A pool has already been ordered by its draw, so reshuffling would undo it.
    // Otherwise seed the shuffle on the attempt, the way the class-prep and
    // catch-up gates do. Math.random() here re-ordered the paper on every GET,
    // so a student who refreshed mid-attempt watched the questions rearrange
    // themselves around the answers they had already given.
    //
    // The !test.shuffle_sections guard is explicit rather than implied. A
    // sectioned test always has a draw, so !started.draw already keeps this
    // from firing today, but that is an accident of another function's
    // behaviour. Without saying it here, one change to ensureTestDraw would
    // scramble a sectioned paper's sections into each other and nothing would
    // fail loudly.
    if (test.shuffle_questions && !test.shuffle_sections && !started.draw) {
      const seed = attemptSeed(user.id, testId, Number(started.attempt.attempt_number) || 1);
      questions = seededShuffle(questions, seed);
    }

    // An exam's own timer_mode can override the paper's fixed test_type -- see
    // resolveExamTimer() in exam-timer.ts. null examForTimer resolves as
    // "inherit," which is exactly test.test_type/duration_minutes unchanged.
    const resolvedTimer = resolveExamTimer(examForTimer, test);

    return NextResponse.json({
      test: {
        id: test.id,
        title: test.title,
        description: test.description,
        test_type: resolvedTimer.test_type,
        duration_minutes: resolvedTimer.duration_minutes,
        per_question_seconds: test.per_question_seconds,
        total_marks: test.total_marks,
      },
      questions,
      attempt: started.attempt,
      // Surfaced so the take page can say "Attempt 3" and show a best score to
      // beat, which is what makes an unlimited retake feel like progress.
      attempt_number: started.attempt.attempt_number,
      previous_attempts: started.previous_attempts,
      best_percentage: started.best_percentage,
      resumed: started.resumed,
      // null for every non-exam context, which is what makes an ordinary test
      // completely unaffected by the proctoring UI in take/page.tsx.
      proctoring,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load test';
    const known = attemptError(message);
    if (known) return known;
    console.error('Test attempt GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/tests/attempt
 * Body: { attempt_id, answers, action: 'save' | 'submit' }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await resolveUser(request);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { attempt_id, answers, action } = body || {};
    if (!attempt_id) return NextResponse.json({ error: 'Missing attempt_id' }, { status: 400 });

    if (action === 'submit') {
      const result = await submitAttempt({
        attemptId: attempt_id,
        studentId: user.id,
        answers: answers || undefined,
      });

      // Enrich the review with the stem and the explanation. Seeing WHY an
      // answer was wrong is the entire reason to sit a practice test, and the
      // take flow deliberately does not carry explanations until this moment.
      // Permuted through the same draw the paper was served under, or the
      // options here would be in the bank's order while the selected and
      // correct letters beside them are in the order the student saw.
      const withAnswers = await getComposedTestQuestions(result.test_id, true).catch(() => []);
      const byId = new Map(applyTestDraw(withAnswers, result.draw).map((q) => [q.question_id, q]));

      return NextResponse.json({
        action: 'submitted',
        result: {
          ...result,
          review: result.review.map((r) => {
            const q = byId.get(r.question_id);
            return {
              ...r,
              question_text: q?.question_text ?? null,
              options: q?.options ?? null,
              explanation: q?.explanation_brief ?? null,
              // Present only once someone has asked for the deeper version.
              // The take page uses this to decide between showing it and
              // offering the "explain in more detail" button.
              explanation_detailed: q?.explanation_detailed ?? null,
            };
          }),
        },
        attempt: {
          id: result.attempt_id,
          attempt_number: result.attempt_number,
          score: result.score,
          total_marks: result.total_marks,
          percentage: result.percentage,
          status: 'submitted',
        },
      });
    }

    await saveAttemptAnswers(attempt_id, user.id, answers || {});
    return NextResponse.json({ action: 'saved' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save attempt';
    const known = attemptError(message);
    if (known) return known;
    console.error('Test attempt POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * The doors where "was the student in the class" is a meaningful question.
 *
 * A practice pool and a chapter test are open to everyone by design, so a
 * catch-up gate on them would invent a prerequisite nobody set.
 */
const CLASS_ANCHORED_FOR_GATE = new Set(['exam', 'class_test']);

/**
 * One student's catch-up standing on the classes this run covers.
 *
 * Two reads, and only for the doors that need it. Falls open on any failure:
 * refusing a student because a lookup failed would turn an outage into what
 * looks to them like a rule.
 */
async function resolveCatchupGate(placement: any, studentId: string): Promise<CatchupGateDecision> {
  const OPEN: CatchupGateDecision = { blocked: false, outstanding: [] };
  try {
    // context_id on both gated doors is the scheduled class. The run may cover
    // more than its host class, so the stored list wins where it exists.
    let classIds: string[] = placement.context_id ? [placement.context_id] : [];
    try {
      const stored = await listRunCoveredClasses(placement.id);
      if (stored.length > 0) classIds = stored;
    } catch {
      // Table missing on this environment. The host class is still correct.
    }
    if (classIds.length === 0) return OPEN;

    const supabase = getSupabaseAdminClient();
    const [{ data: classRows }, facts] = await Promise.all([
      (supabase as any)
        .from('nexus_scheduled_classes')
        .select('id, title, scheduled_date')
        .in('id', classIds),
      loadAttendanceAndAbsences([studentId], classIds, supabase),
    ]);

    const attended = facts.attendance.get(studentId);
    const absences = facts.absences.get(studentId);

    const evidence: GateClassEvidence[] = ((classRows || []) as any[]).map((c) => ({
      scheduled_class_id: c.id,
      title: c.title ?? null,
      scheduled_date: c.scheduled_date,
      attended: attended?.get(c.id) ?? null,
      absence: absences?.get(c.id) ?? null,
    }));

    return decideCatchupGate(evidence);
  } catch (err) {
    console.warn('[attempt] catch-up gate skipped:', (err as Error)?.message);
    return OPEN;
  }
}
