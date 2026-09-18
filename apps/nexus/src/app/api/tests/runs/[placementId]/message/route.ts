import { NextRequest, NextResponse } from 'next/server';
import {
  filterTrackedStudentIds,
  getPlacementById,
  getSupabaseAdminClient,
  loadRunSittings,
  recordClassTestReminder,
  setTestAccessForStudent,
} from '@neram/database';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { extractBearerToken } from '@/lib/ms-verify';
import { errorResponse } from '@/lib/api-errors';
import { canPostToGraph } from '@/lib/teams-assignment-announcements';
import { escapeMessageHtml } from '@/lib/teams-class-announcements';
import { sendNudge, plainToHtml, plainToHtmlWithLink, type NudgeResult } from '@/lib/nudge-delivery';
import { shareBaseUrl } from '@/lib/class-share-links';
import { tellWhyUrl } from '@/lib/tell-why-link';
import { narrowToRoster, resolveRunClassroom, resolveRunRoster } from '@/lib/run-roster';
import { formatReopenUntil, reopenUntilProblem } from '@/lib/reopen-deadline';
import {
  TELL_WHY_LINK_LABEL,
  fillConstants,
  isTestMessageTemplate,
  renderGroupPostHtml,
  renderTestMessage,
  templateLinksToWhy,
  type TestMessageContext,
} from '@/lib/test-message-templates';

/**
 * POST /api/tests/runs/[placementId]/message            (staff, coord.nudge)
 *
 * One press, four places: the student's Teams 1:1 chat, their Teams activity
 * feed, the Nexus bell, and one combined post in the class Teams channel naming
 * everyone it is for. Optionally reopening the run for them first, so "reopened
 * and told" is a single action rather than two screens.
 *
 * Everything goes through sendNudge, deliberately. It is the documented choke
 * point for reaching a student, it holds the dormancy rule and the "never
 * double-message" rule, and a feature that reached students some other way would
 * be the start of a second delivery system nobody maintains.
 *
 * WHAT THE CLIENT MAY SEND. Choices, plain text, a deadline, and a list of
 * student ids. Never markup: the body arrives as text and is escaped here before
 * any of it reaches Graph, the same rule the class and assignment share routes
 * hold. And the id list NARROWS: it is intersected with the run's roster before
 * anything is sent, so posting a stranger's id reaches nobody.
 *
 * A REOPEN CARRIES ITS DEADLINE. The teacher picks the day; the route checks it
 * with the same rule the sheet uses, and every message says when it closes. On
 * 11 Sept a separate reopen button silently used three days nobody chose and
 * told students only through the bell.
 *
 * TWO TOKENS. The chat message and the group post are delegated (they go out as
 * the teacher, and app-only credentials cannot post a chatMessage at all), so the
 * browser must send getTeacherToken(), whose scopes include the chat
 * permissions. The activity ping is app-only. A session on a Nexus-minted token
 * (test_, imp_, par_) has no Graph identity, so those two tiers are skipped and
 * the bell and email still land.
 */

interface Ctx {
  params: { placementId: string };
}

// A whole class, each getting a chat message and an activity ping, then one
// group post. The default budget does not cover forty.
export const maxDuration = 300;

const TEMPLATE_LOG_NAME = 'results_message';

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(user, 'coord.nudge');

    const body = await request.json().catch(() => ({}) as any);

    const requested: string[] = Array.isArray(body?.student_ids)
      ? body.student_ids.filter((x: unknown) => typeof x === 'string' && x.trim())
      : [];
    if (requested.length === 0) {
      return NextResponse.json({ error: 'Nobody was selected.' }, { status: 400 });
    }

    const template = isTestMessageTemplate(body?.template) ? body.template : 'custom';
    const channels = {
      chat: body?.channels?.chat !== false,
      activity: body?.channels?.activity !== false,
      inapp: true, // Never optional. The durable record is the point.
      group: body?.channels?.group === true,
    };
    const alsoReopen = body?.also_reopen === true;
    const includeDormant = body?.include_dormant === true;

    const closesAt = typeof body?.closes_at === 'string' ? body.closes_at : null;
    if (alsoReopen) {
      const problem = reopenUntilProblem(closesAt);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    const placement = await getPlacementById(params.placementId, supabase);
    if (!placement) {
      return NextResponse.json({ error: 'That run no longer exists' }, { status: 404 });
    }

    const roster = await resolveRunRoster(placement as any, supabase);
    if (roster === null) {
      return NextResponse.json(
        { error: 'This run has no roster, so it cannot be messaged as a group.' },
        { status: 400 },
      );
    }
    const targets = narrowToRoster(requested, roster);
    if (targets.length === 0) {
      return NextResponse.json({ error: 'None of those students are on this run.' }, { status: 400 });
    }

    const { data: test } = await supabase
      .from('nexus_tests')
      .select('title')
      .eq('id', (placement as any).test_id)
      .maybeSingle();

    const untilLabel = alsoReopen && closesAt ? formatReopenUntil(closesAt) : null;
    const ctx: TestMessageContext = {
      testTitle: (test as any)?.title || 'this test',
      passMark: numOrNull((placement as any).passing_pct),
      dueLabel: formatDay(
        (placement as any).available_until || (placement as any).gating?.due_at || null,
      ),
      reopening: alsoReopen,
      until: untilLabel,
    };

    // The chosen template is re-rendered HERE. A body the client sends is only
    // honoured for 'custom', which is the one case where the words are genuinely
    // the teacher's own, and even then it arrives as text and is escaped below.
    const rendered = renderTestMessage(template, ctx);
    const rawSubject =
      typeof body?.subject === 'string' && body.subject.trim()
        ? body.subject.trim().slice(0, 200)
        : rendered.subject;
    const rawBody =
      typeof body?.body === 'string' && body.body.trim()
        ? body.body.trim().slice(0, 4000)
        : rendered.body;

    if (!rawSubject || !rawBody) {
      return NextResponse.json({ error: 'The message needs a subject and a body.' }, { status: 400 });
    }

    const subject = fillConstants(rawSubject, ctx);
    const plain = fillConstants(rawBody, ctx);

    // Who is dormant is decided BEFORE anyone is reopened, so the same people are
    // reopened and told. On 11 Sept the reopen reached all 26 and the message
    // reached 23, which left three students with an open window nobody had
    // mentioned. sendNudge applies the same rule to the message below.
    const toReach = includeDormant ? targets : (await filterTrackedStudentIds(targets)).kept;

    // Reopen BEFORE messaging, never after. A message that says "I have
    // reopened it" must not go out ahead of the grant, or a student who acts on
    // it immediately finds the door still shut.
    const reopened: string[] = [];
    if (alsoReopen) {
      for (const studentId of toReach) {
        try {
          await setTestAccessForStudent({
            placementId: params.placementId,
            studentId,
            action: 'open',
            closesAt,
            note: 'Reopened with a message from the results screen',
            actorId: user.id,
          });
          reopened.push(studentId);
        } catch (err) {
          console.error(`Reopen during message failed for ${studentId}:`, err);
        }
      }
    }

    // Per-student values sendNudge fills in. The score is the one number that
    // makes a redo message land, and it is read here rather than trusted from
    // the browser.
    const personalise = await loadPersonalisation(targets, placement as any, supabase);

    const graphToken = extractBearerToken(request.headers.get('Authorization'));
    const canGraph = canPostToGraph(graphToken);
    const bodyHtml = escapeMessageHtml(plain).replace(/\n/g, '<br/>');

    // "Tell me why" carries a real link to the card's "Tell your teacher why",
    // opened straight onto this run. plainToHtml escapes a URL into inert text,
    // so the anchor is added here rather than typed into the template. The bell
    // copy reaches the same page through NotificationBell (metadata.template).
    const chatHtml = templateLinksToWhy(template)
      ? plainToHtmlWithLink(
          plain,
          tellWhyUrl(shareBaseUrl(request.nextUrl?.origin ?? null), params.placementId),
          TELL_WHY_LINK_LABEL,
        )
      : plainToHtml(plain);

    const classroomId = channels.group
      ? await resolveRunClassroom(placement as any, supabase)
      : null;

    const { results, counts } = await sendNudge({
      studentIds: targets,
      subject,
      plain,
      html: chatHtml,
      teamsText: subject,
      eventType: alsoReopen ? 'test_reopened' : 'test_result_message',
      metadata: {
        test_id: (placement as any).test_id,
        placement_id: params.placementId,
        template,
        ...(alsoReopen ? { closes_at: closesAt } : {}),
      },
      personalise,
      // A teacher picked these people by name and can see who they picked, so
      // the dormancy filter is theirs to override. Surfaced in the sheet, never
      // applied silently.
      respectDormancy: !includeDormant,
      ...(channels.chat && canGraph
        ? { chat: { delegatedToken: graphToken as string, html: chatHtml } }
        : {}),
      ...(channels.group && canGraph && classroomId
        ? {
            group: {
              delegatedToken: graphToken as string,
              classroomId,
              html: renderGroupPostHtml({
                testTitle: ctx.testTitle,
                count: alsoReopen ? reopened.length : toReach.length,
                reopening: alsoReopen,
                until: untilLabel,
                bodyHtml,
              }),
              peopleLabel: 'This is for',
            },
          }
        : {}),
    });

    // One row per recipient, so a second teacher can see who was already
    // chased. The template name is distinct from the automated sweep's, because
    // decideClassTestReminders counts by template and a manual message must not
    // eat into an automated cooldown.
    for (const r of results) {
      await recordClassTestReminder(
        {
          placement_id: params.placementId,
          student_id: r.studentId,
          sent_by: user.id,
          channel: r.channel,
          template: TEMPLATE_LOG_NAME,
        },
        supabase,
      );
    }

    return NextResponse.json({
      data: {
        results,
        counts,
        reopened: reopened.length,
        closes_at: alsoReopen ? closesAt : null,
        // Named, so "3 skipped" on the receipt is three people, not a number.
        skipped_dormant: results
          .filter((r) => r.channel === 'dormant')
          .map((r) => ({ id: r.studentId, name: r.name })),
        reasons: groupReasons(results),
        off_roster: requested.length - targets.length,
        // Said plainly rather than left to be inferred from a zero count: a
        // teacher on an impersonation or test session needs to know WHY the
        // Teams tiers did nothing.
        graph_skipped: (channels.chat || channels.group) && !canGraph,
      },
    });
  } catch (err) {
    return errorResponse(err, 'Could not send that message');
  }
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatDay(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

/**
 * Each tier's distinct failure reasons, with how many students hit each, so the
 * receipt says one line per cause instead of listing 23 identical refusals.
 */
function groupReasons(results: NudgeResult[]) {
  const out: Record<'chat' | 'teams', Array<{ reason: string; count: number }>> = {
    chat: [],
    teams: [],
  };
  for (const tier of ['chat', 'teams'] as const) {
    const tally = new Map<string, number>();
    for (const r of results) {
      const reason = r.reasons?.[tier];
      if (reason) tally.set(reason, (tally.get(reason) || 0) + 1);
    }
    out[tier] = [...tally.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  }
  return out;
}

/**
 * Each student's score on this run, as {score}, and the day they made it, as {date}.
 *
 * Read here rather than accepted from the browser: the number in a message that
 * tells somebody to do better has to be the number on their record. A student
 * with no attempt gets "no attempt yet", which is the honest thing to say to
 * exactly the group the "missed" template is aimed at.
 *
 * Which attempts are "on this run" is run-sittings.ts's answer, the same one the
 * Students tab shows. Through the run's own door it is their best. Through
 * another door, or counted by a teacher, it is the one sitting that counts, and
 * {date} is when they made it, for the "No need to retake" message.
 */
async function loadPersonalisation(
  studentIds: string[],
  placement: { id: string; test_id: string; available_from?: string | null; available_until?: string | null },
  supabase: any,
): Promise<Record<string, Record<string, string>>> {
  const out: Record<string, Record<string, string>> = {};

  const [{ data: users }, byRun] = await Promise.all([
    supabase.from('users').select('id, name').in('id', studentIds),
    loadRunSittings<any>([placement], { studentIds, columns: 'percentage' }, supabase),
  ]);

  const best = new Map<string, number>();
  const madeOn = new Map<string, string>();
  byRun.get(placement.id)?.forEach((sitting) => {
    const counted = sitting.source === 'run' ? sitting.attempts : sitting.first ? [sitting.first] : [];
    for (const a of counted) {
      if (a.status !== 'submitted' && a.status !== 'graded') continue;
      const pct = Number(a.percentage);
      if (!Number.isFinite(pct)) continue;
      if (!best.has(sitting.student_id) || pct > (best.get(sitting.student_id) as number)) {
        best.set(sitting.student_id, pct);
      }
    }
    const day = formatDay(sitting.first?.submitted_at ?? null);
    if (day) madeOn.set(sitting.student_id, day);
  });

  for (const u of (users || []) as any[]) {
    // First name only. "Hi Asha" is a message; "Hi Asha Ramachandran" is a form
    // letter, and the students reading these are teenagers.
    const first = String(u.name || '').trim().split(/\s+/)[0] || 'there';
    const pct = best.get(u.id);
    out[u.id] = {
      name: first,
      score: pct == null ? 'no attempt yet' : `${Math.round(pct)}%`,
      date: madeOn.get(u.id) ?? 'your earlier attempt',
    };
  }

  for (const id of studentIds) {
    if (!out[id]) out[id] = { name: 'there', score: 'no attempt yet', date: 'your earlier attempt' };
  }
  return out;
}
