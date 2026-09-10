import { NextRequest, NextResponse } from 'next/server';
import {
  getPlacementById,
  getSupabaseAdminClient,
  recordClassTestReminder,
  setTestAccessForStudent,
} from '@neram/database';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { extractBearerToken } from '@/lib/ms-verify';
import { errorResponse } from '@/lib/api-errors';
import { canPostToGraph } from '@/lib/teams-assignment-announcements';
import { escapeMessageHtml } from '@/lib/teams-class-announcements';
import { sendNudge, plainToHtml } from '@/lib/nudge-delivery';
import { narrowToRoster, resolveRunClassroom, resolveRunRoster } from '@/lib/run-roster';
import {
  fillConstants,
  isTestMessageTemplate,
  renderGroupPostHtml,
  renderTestMessage,
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
 * WHAT THE CLIENT MAY SEND. Choices, plain text, and a list of student ids.
 * Never markup: the body arrives as text and is escaped here before any of it
 * reaches Graph, the same rule the class and assignment share routes hold. And
 * the id list NARROWS: it is intersected with the run's roster before anything
 * is sent, so posting a stranger's id reaches nobody.
 *
 * TWO TOKENS. The chat message and the group post are delegated (they go out as
 * the teacher, and app-only credentials cannot post a chatMessage at all), while
 * the activity ping is app-only. A session on a Nexus-minted token (test_, imp_,
 * par_) has no Graph identity, so those two tiers are skipped and the bell and
 * email still land.
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

    const ctx: TestMessageContext = {
      testTitle: (test as any)?.title || 'this test',
      passMark: numOrNull((placement as any).passing_pct),
      dueLabel: formatDay(
        (placement as any).available_until || (placement as any).gating?.due_at || null,
      ),
      reopening: alsoReopen,
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

    // Reopen BEFORE messaging, never after. A message that says "I have
    // reopened it" must not go out ahead of the grant, or a student who acts on
    // it immediately finds the door still shut.
    const reopened: string[] = [];
    if (alsoReopen) {
      for (const studentId of targets) {
        try {
          await setTestAccessForStudent({
            placementId: params.placementId,
            studentId,
            action: 'open',
            closesAt: body?.closes_at ?? null,
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
    const personalise = await loadPersonalisation(
      targets,
      (placement as any).test_id,
      params.placementId,
      supabase,
    );

    const graphToken = extractBearerToken(request.headers.get('Authorization'));
    const canGraph = canPostToGraph(graphToken);
    const bodyHtml = escapeMessageHtml(plain).replace(/\n/g, '<br/>');

    const classroomId = channels.group
      ? await resolveRunClassroom(placement as any, supabase)
      : null;

    const { results, counts } = await sendNudge({
      studentIds: targets,
      subject,
      plain,
      html: plainToHtml(plain),
      teamsText: subject,
      eventType: alsoReopen ? 'test_reopened' : 'test_result_message',
      metadata: {
        test_id: (placement as any).test_id,
        placement_id: params.placementId,
        template,
      },
      personalise,
      // A teacher picked these people by name and can see who they picked, so
      // the dormancy filter is theirs to override. Surfaced in the dialog, never
      // applied silently.
      respectDormancy: !includeDormant,
      ...(channels.chat && canGraph
        ? { chat: { delegatedToken: graphToken as string, html: plainToHtml(plain) } }
        : {}),
      ...(channels.group && canGraph && classroomId
        ? {
            group: {
              delegatedToken: graphToken as string,
              classroomId,
              html: renderGroupPostHtml({
                testTitle: ctx.testTitle,
                count: targets.length,
                reopening: alsoReopen,
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
 * Each student's best percentage on this run, as {score}.
 *
 * Read here rather than accepted from the browser: the number in a message that
 * tells somebody to do better has to be the number on their record. A student
 * with no attempt gets "no attempt yet", which is the honest thing to say to
 * exactly the group the "missed" template is aimed at.
 */
async function loadPersonalisation(
  studentIds: string[],
  testId: string,
  placementId: string,
  supabase: any,
): Promise<Record<string, Record<string, string>>> {
  const out: Record<string, Record<string, string>> = {};

  const { data: users } = await supabase.from('users').select('id, name').in('id', studentIds);
  const { data: attempts } = await supabase
    .from('nexus_test_attempts')
    .select('student_id, percentage')
    .eq('test_id', testId)
    .eq('placement_id', placementId)
    .in('status', ['submitted', 'graded'])
    .in('student_id', studentIds);

  const best = new Map<string, number>();
  for (const a of (attempts || []) as any[]) {
    const pct = Number(a.percentage);
    if (!Number.isFinite(pct)) continue;
    if (!best.has(a.student_id) || pct > (best.get(a.student_id) as number)) {
      best.set(a.student_id, pct);
    }
  }

  for (const u of (users || []) as any[]) {
    // First name only. "Hi Asha" is a message; "Hi Asha Ramachandran" is a form
    // letter, and the students reading these are teenagers.
    const first = String(u.name || '').trim().split(/\s+/)[0] || 'there';
    const pct = best.get(u.id);
    out[u.id] = {
      name: first,
      score: pct == null ? 'no attempt yet' : `${Math.round(pct)}%`,
    };
  }

  for (const id of studentIds) {
    if (!out[id]) out[id] = { name: 'there', score: 'no attempt yet' };
  }
  return out;
}
