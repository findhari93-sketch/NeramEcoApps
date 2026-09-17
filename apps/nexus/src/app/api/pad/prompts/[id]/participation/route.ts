import { NextRequest } from 'next/server';
import { assertPadStaff, resolvePadCaller } from '@/lib/pad/caller';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { isUuid } from '@/lib/pad/session-binding';
import { loadPromptSessionId, loadSessionMeta, padDb, rosterFor, userNames } from '@/lib/pad/sessions';

export const dynamic = 'force-dynamic';

interface ParticipationRow {
  student_id: string;
  on_roster: boolean;
  participation: 'answered' | 'silent' | 'absent';
  result: 'correct' | 'incorrect' | 'ungraded' | null;
  answer: string | null;
  joined_mid_prompt: boolean;
}

/**
 * GET /api/pad/prompts/:id/participation  (session teacher, prompt not OPEN)
 *
 * "View details": one row per roster student (answered, present but silent,
 * absent) plus anyone who answered off the roster, with names. Refused with 409
 * PROMPT_OPEN while students are still answering: count only, no names.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    assertPadStaff(caller);
    if (!isUuid(params.id)) throw new PadRefusal('NOT_FOUND');

    const sessionId = await loadPromptSessionId(params.id);
    const meta = sessionId ? await loadSessionMeta(sessionId) : null;
    if (!meta) throw new PadRefusal('NOT_FOUND');
    // Before loading anyone's roster.
    if (meta.teacher_id !== caller.user.id) throw new PadRefusal('NOT_SESSION_TEACHER');

    const roster = await rosterFor(meta.classroom_id, meta.batch_id);
    const result = await callPad<{ rows: ParticipationRow[] }>(padDb(), 'pad_participation', {
      p_actor: caller.user.id,
      p_prompt: params.id,
      p_roster: roster.ids,
    });

    const unnamed = result.rows.map((row) => row.student_id).filter((id) => !(id in roster.names));
    const extraNames = await userNames(unnamed);
    const rows = result.rows
      .map((row) => ({ ...row, name: roster.names[row.student_id] ?? extraNames[row.student_id] ?? null }))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '') || a.student_id.localeCompare(b.student_id));

    return padJson({ rows });
  } catch (err) {
    return padErrorResponse(err, 'participation');
  }
}
