import { NextRequest, NextResponse } from 'next/server';
import {
  getExamResults,
  saveExamResults,
  setExamResultsState,
  recordExamTeamsPost,
  recordPointEvent,
  awardBadge,
  recomputeExamScores,
  getSupabaseAdminClient,
} from '@neram/database';
import { requireExamStaff, loadExamRoster } from '@/lib/exam-access';
import { extractBearerToken } from '@/lib/ms-verify';
import { buildExamResultSections } from '@/lib/exam-results-model';
import { renderShareHtml, renderShareText } from '@/lib/class-share-render';
import { postChannelMessageDetailed, isPostError, resolveMeetingChannelId } from '@/lib/teams-class-announcements';
import { examBadgesFor, examPointsFor } from '@/lib/exam-badges';
import type { ShareSectionId } from '@/lib/class-share-model';

/**
 * Publish an exam's results.
 *
 * GET returns exactly what the preview dialog renders, plus blockers and
 * warnings. POST does the publishing. Same split, and the same reasoning, as
 * api/timetable/[classId]/share: the client sends section toggles and nothing
 * else, and the HTML is re-derived server side so a tampered body cannot post
 * something other than the truth.
 *
 * THE ORDER OF THE STEPS IN POST IS LOAD-BEARING. The snapshot is written
 * before anything is announced, so a Teams post that succeeds beside a write
 * that failed cannot leave a published podium with no record behind it.
 */

async function buildModel(examId: string, classroomId: string) {
  // Fold in any drawings marked since the last look, so a teacher who finished
  // grading in another tab gets final results rather than provisional ones.
  // Idempotent and cheap.
  await recomputeExamScores(examId).catch((err) => {
    console.error('[Exam Publish] could not refresh drawing scores:', err);
  });

  const roster = await loadExamRoster(classroomId);
  const results = await getExamResults(examId, roster);
  return { roster, results };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { examId: string } }
) {
  try {
    const access = await requireExamStaff(request.headers.get('Authorization'), params.examId);
    if (!access.ok) return access.response;
    const exam = access.exam;

    const supabase = getSupabaseAdminClient();
    const { data: classroom } = await supabase
      .from('nexus_classrooms' as any)
      .select('id, name, ms_team_id, ms_channel_id')
      .eq('id', exam.classroom_id)
      .maybeSingle();

    const { results } = await buildModel(params.examId, exam.classroom_id);

    const blockers: string[] = [];
    const warnings: string[] = [];

    if (results.stats.sat === 0) {
      blockers.push('Nobody has sat this exam yet, so there is nothing to publish.');
    }
    if (new Date(exam.closes_at) > new Date()) {
      warnings.push(
        'This exam is still open. Publishing now announces a result some students can still change.',
      );
    }
    if (results.drawings_ungraded > 0) {
      warnings.push(
        `${results.drawings_ungraded} drawing${results.drawings_ungraded === 1 ? ' is' : 's are'} not graded yet. Publishing now marks these results Provisional.`,
      );
    }
    if (!(classroom as any)?.ms_team_id) {
      warnings.push('This classroom has no Teams channel linked, so nothing will be posted there.');
    }

    const provisional = results.drawings_ungraded > 0;
    const sections = buildExamResultSections({
      examTitle: exam.title || 'Exam',
      classroomName: (classroom as any)?.name ?? null,
      results,
      provisional,
    });

    const enabled = new Set<ShareSectionId>(
      sections.filter((s) => s.toggleable).map((s) => s.id),
    );

    return NextResponse.json(
      {
        data: {
          exam,
          results,
          sections,
          provisional,
          blockers,
          warnings,
          preview: {
            text: renderShareText(sections, enabled),
            html: renderShareHtml(sections, enabled),
          },
        },
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Exam Publish API] GET Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { examId: string } }
) {
  try {
    const access = await requireExamStaff(request.headers.get('Authorization'), params.examId);
    if (!access.ok) return access.response;
    const exam = access.exam;

    const body = await request.json().catch(() => ({}));
    const requestedSections: string[] = Array.isArray(body?.sections) ? body.sections : [];
    const postToTeams = body?.post_to_teams !== false;

    const supabase = getSupabaseAdminClient();
    const { data: classroom } = await supabase
      .from('nexus_classrooms' as any)
      .select('id, name, ms_team_id, ms_channel_id')
      .eq('id', exam.classroom_id)
      .maybeSingle();

    /**
     * A delegated Microsoft token is required to post a chatMessage. An
     * app-only token cannot, whatever its permissions.
     *
     * The caller's own bearer token IS that delegated token, which is exactly
     * how api/timetable/[classId]/share does it. The test, impersonation and
     * parent tokens are rejected by prefix, same as there: none of them is a
     * real Microsoft token and Graph would answer with something unhelpful.
     *
     * CONSEQUENCE WE ACCEPT: exam results can never be auto-published by a
     * cron. A teacher presses the button while signed in, which is what the
     * design asks for anyway, but it does rule out "post at 13:05 automatically".
     */
    const graphToken = extractBearerToken(request.headers.get('Authorization'));
    if (postToTeams && (classroom as any)?.ms_team_id) {
      if (!graphToken || /^(test_|imp_|par_)/.test(graphToken)) {
        return NextResponse.json(
          {
            error:
              'Posting to Teams needs your own Microsoft sign-in. Publish without posting, then copy the card into the channel.',
            code: 'NO_DELEGATED_TOKEN',
          },
          { status: 400 },
        );
      }
    }

    // Re-derived server side. The client only chose which sections to show.
    const { results } = await buildModel(params.examId, exam.classroom_id);
    if (results.stats.sat === 0) {
      return NextResponse.json(
        { error: 'Nobody has sat this exam yet, so there is nothing to publish.' },
        { status: 400 },
      );
    }

    const provisional = results.drawings_ungraded > 0;

    // ── 1. The snapshot, FIRST ──────────────────────────────────────────────
    // Rank is frozen here on purpose: it is about to be named in a Teams post
    // and in a private message, and a makeup sitting three days later must not
    // silently renumber a podium that has already been announced.
    await saveExamResults(
      params.examId,
      results.rows.map((row) => ({
        student_id: row.student_id,
        attempt_id: row.attempt_id,
        rank: row.rank,
        score: row.score,
        total_marks: row.total_marks,
        percentage: row.percentage,
        section_scores: row.section_scores as unknown,
        is_provisional: row.provisional,
        absent: row.absent,
      })),
    );

    // ── 2. Stamp the exam ───────────────────────────────────────────────────
    await setExamResultsState(
      params.examId,
      provisional ? 'provisional' : 'final',
      access.caller.id,
    );

    // ── 3. Points and badges ────────────────────────────────────────────────
    const gamification = await awardExamGamification({
      examId: params.examId,
      classroomId: exam.classroom_id,
      rows: results.rows,
      isFinal: !provisional,
    });

    // ── 4. Teams, last, because it is the only step that cannot be retried
    //      cleanly. A second press posts a second card, deliberately: the same
    //      trade the share route makes, and a duplicate announcement is far
    //      less harmful than a silently missing one.
    let teamsMessageId: string | null = null;
    let teamsError: string | null = null;

    if (postToTeams && (classroom as any)?.ms_team_id && graphToken) {
      const sections = buildExamResultSections({
        examTitle: exam.title || 'Exam',
        classroomName: (classroom as any)?.name ?? null,
        results,
        provisional,
      });
      const enabled = new Set<ShareSectionId>(
        (requestedSections.length > 0
          ? requestedSections
          : sections.filter((s) => s.toggleable).map((s) => s.id)) as ShareSectionId[],
      );
      const html = renderShareHtml(sections, enabled);

      const channelId =
        (classroom as any).ms_channel_id ||
        (await resolveMeetingChannelId(graphToken, (classroom as any).ms_team_id));

      if (channelId) {
        const posted = await postChannelMessageDetailed(
          graphToken,
          (classroom as any).ms_team_id,
          channelId,
          html,
        );
        if (isPostError(posted)) {
          teamsError = posted.error;
        } else {
          teamsMessageId = posted.id;
          await recordExamTeamsPost(params.examId, posted.id);
        }
      } else {
        teamsError = 'No channel could be resolved for this classroom.';
      }
    }

    return NextResponse.json(
      {
        data: {
          published: true,
          state: provisional ? 'provisional' : 'final',
          students: results.rows.length,
          teams_message_id: teamsMessageId,
          teams_error: teamsError,
          ...gamification,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Exam Publish API] POST Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Points for everyone who sat it, badges for the podium.
 *
 * THE POINTS TRAP, and it is subtle: source_id must be `exam:<examId>` and
 * never the attempt id, or re-publishing after grading the drawings inserts a
 * second event and doubles everyone's points. But recordPointEvent upserts with
 * ignoreDuplicates, so a genuine provisional-to-final correction (40% becoming
 * 78%) would then silently NOT update. So the update is explicit, and only on
 * that transition. Weakening the idempotency to solve it would be the wrong fix.
 */
async function awardExamGamification(input: {
  examId: string;
  classroomId: string;
  rows: Array<{
    student_id: string;
    rank: number | null;
    percentage: number;
    absent: boolean;
    attempt_id: string | null;
  }>;
  isFinal: boolean;
}): Promise<{ points_awarded: number; badges_awarded: number }> {
  const supabase = getSupabaseAdminClient();
  const sourceId = `exam:${input.examId}`;
  const sat = input.rows.filter((r) => !r.absent && r.attempt_id);
  const candidates = sat.length;

  // How many scheduled exams each of these students has now sat, and their best
  // previous percentage. One query each rather than per student.
  const studentIds = sat.map((r) => r.student_id);
  const { data: priorResults } = await supabase
    .from('nexus_exam_results' as any)
    .select('student_id, exam_id, percentage')
    .in('student_id', studentIds.length > 0 ? studentIds : ['00000000-0000-0000-0000-000000000000'])
    .eq('absent', false);

  const history = new Map<string, { count: number; best: number | null }>();
  for (const r of (priorResults || []) as any[]) {
    const entry = history.get(r.student_id) ?? { count: 0, best: null };
    entry.count += 1;
    if (r.exam_id !== input.examId && r.percentage != null) {
      entry.best = entry.best == null ? Number(r.percentage) : Math.max(entry.best, Number(r.percentage));
    }
    history.set(r.student_id, entry);
  }

  let pointsAwarded = 0;
  let badgesAwarded = 0;

  for (const row of sat) {
    const prior = history.get(row.student_id) ?? { count: 1, best: null };
    const points = examPointsFor(row.percentage);

    try {
      await recordPointEvent({
        student_id: row.student_id,
        classroom_id: input.classroomId,
        event_type: 'quiz_completed',
        points,
        source_id: sourceId,
        metadata: { exam_id: input.examId, rank: row.rank, percentage: row.percentage },
      });

      // recordPointEvent ignores duplicates, so a re-publish after drawings are
      // marked would leave the provisional points in place. Correct them
      // explicitly rather than inserting a second event.
      if (input.isFinal) {
        await supabase
          .from('gamification_point_events' as any)
          .update({ points, metadata: { exam_id: input.examId, rank: row.rank, percentage: row.percentage } })
          .eq('student_id', row.student_id)
          .eq('event_type', 'quiz_completed')
          .eq('source_id', sourceId);
      }
      pointsAwarded += 1;
    } catch (err) {
      console.error(`[Exam publish] points failed for ${row.student_id}:`, err);
    }

    for (const badgeId of examBadgesFor({
      rank: row.rank,
      percentage: row.percentage,
      candidates,
      examsSat: Math.max(1, prior.count),
      previousBestPct: prior.best,
    })) {
      try {
        // UNIQUE(student_id, badge_id) makes a repeat a no-op returning false.
        const awarded = await awardBadge(row.student_id, badgeId, {
          exam_id: input.examId,
          rank: row.rank,
          percentage: row.percentage,
        });
        if (awarded) badgesAwarded += 1;
      } catch (err) {
        console.error(`[Exam publish] badge ${badgeId} failed for ${row.student_id}:`, err);
      }
    }
  }

  return { points_awarded: pointsAwarded, badges_awarded: badgesAwarded };
}
