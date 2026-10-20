/**
 * Keeps each Teams demo's evidence fresh and lets the demo decide itself.
 * The 5-minute cron checks demos that started in the last week (often right
 * after the class, then slower), and the desk's "Check now" button checks one
 * on demand, which also covers a test run held before the booked time.
 *
 * Each check reads attendance, recordings and the transcript, then:
 * - picks the recording of the real class when staff have not picked one,
 * - stores the transcript (demo_transcripts),
 * - marks Attended or No-show when the evidence is clear (lib/demo/demo-verdict),
 *   exactly as the desk's own buttons do: thank-you or missed message, and the
 *   follow-up that carries the student to enrolment.
 * A mark staff made is never changed. Unclear demos wait for a person.
 */

import {
  cancelPendingDemoMessages,
  enqueueDemoMessages,
  getSupabaseAdminClient,
  logDemoRequestEvent,
  openDemoFollowUp,
  rebookFollowUpAt,
  thanksSendAfter,
  updateDemoRequest,
  type TypedSupabaseClient,
} from '@neram/database';
import { loadDemoSettings } from './server';
import { readDemoTeams } from './teams-artifacts';
import { guestsWhoJoined, hasLiveTeamsMeeting, type DemoWithTeams } from './teams-evidence';
import { autoFollowUpAt, autoPickRecording, demoVerdict, demoWindow, verdictAction, type DemoVerdict, type VerdictAction } from './demo-verdict';
import { demoTranscriptStats, parseDemoVtt, type DemoTranscriptStats } from './demo-transcript';

export { hasLiveTeamsMeeting };

const MIN = 60_000;
const LOOKBACK_MS = 7 * 24 * 60 * MIN;
const PER_RUN = 4;

/** Often while the result matters, rarely once only a late recording could still arrive. */
function recheckMs(sinceEnd: number): number {
  if (sinceEnd < 3 * 60 * MIN) return 10 * MIN;
  if (sinceEnd < 24 * 60 * MIN) return 30 * MIN;
  return 6 * 60 * MIN;
}

type CheckFields = Pick<
  DemoWithTeams,
  'status' | 'scheduled_start' | 'scheduled_minutes' | 'graph_event_id' | 'organizer_upn' | 'teams_join_url' | 'teams_checked_at' | 'recording_item_id'
> &
  Partial<Pick<DemoWithTeams, 'transcript_found_at' | 'attendance_source'>>;

/** Whether the cron should look at this demo now. */
export function needsTeamsCheck(r: CheckFields, now: Date): boolean {
  if (!hasLiveTeamsMeeting(r) || !r.scheduled_start) return false;
  if (!['approved', 'attended', 'no_show'].includes(r.status)) return false;
  const start = new Date(r.scheduled_start).getTime();
  const w = demoWindow(r.scheduled_start, r.scheduled_minutes || 45);
  // From 10 minutes in (attendance shows once people have left) until a week after.
  if (now.getTime() < start + 10 * MIN || now.getTime() > start + LOOKBACK_MS) return false;
  // A Teams No-show stays open while a late student could still turn up.
  const settled = r.status === 'attended' || (r.status === 'no_show' && (r.attendance_source !== 'teams' || now.getTime() > w.to));
  if (settled && r.recording_item_id && r.transcript_found_at) return false;
  if (!r.teams_checked_at) return true;
  return now.getTime() - new Date(r.teams_checked_at).getTime() >= recheckMs(now.getTime() - w.end);
}

/** Mark the demo the way the desk's Attended / No-show buttons do, with Teams as the source. */
async function applyVerdict(r: DemoWithTeams, action: Exclude<VerdictAction, null>, v: Omit<DemoVerdict, 'at'>, supabase: any, now: Date) {
  const attended = action === 'mark_attended';
  await updateDemoRequest(r.id, { status: attended ? 'attended' : 'no_show', attended, attendance_marked_at: now.toISOString() }, supabase);
  await supabase.from('demo_class_registrations').update({ attendance_source: 'teams', attendance_marked_by: null }).eq('id', r.id);
  await cancelPendingDemoMessages(r.id, undefined, supabase);
  const start = new Date(r.scheduled_start!);
  await enqueueDemoMessages(
    r,
    [attended ? { kind: 'thanks', sendAfter: thanksSendAfter(start, r.scheduled_minutes, now) } : { kind: 'missed', sendAfter: now }],
    supabase,
  );
  if (r.user_id) {
    await openDemoFollowUp(
      attended
        ? {
            userId: r.user_id,
            demoRegistrationId: r.id,
            kind: 'post_demo',
            dueAt: autoFollowUpAt(start.getTime() + r.scheduled_minutes * MIN, now),
            note: 'Opened automatically after the demo. Set their interest on the first call.',
            actorId: null,
          }
        : { userId: r.user_id, demoRegistrationId: r.id, kind: 'demo_rebook', dueAt: rebookFollowUpAt(now), actorId: null },
      supabase,
    );
  }
  await logDemoRequestEvent(
    { registration_id: r.id, kind: 'status', outcome: attended ? 'attended' : 'no_show', note: `Marked automatically from Teams. ${v.reason}`, actor_id: null },
    supabase,
  );
}

/** Read Teams for one demo, store what it saw, and decide. Returns the note, null when everything was read. */
export async function syncDemoTeams(r: DemoWithTeams, client?: TypedSupabaseClient, now: Date = new Date()): Promise<string | null> {
  const supabase = (client ?? getSupabaseAdminClient()) as any;
  if (!hasLiveTeamsMeeting(r)) return 'This demo has no Teams meeting made by the desk.';
  const settings = await loadDemoSettings(supabase);
  const start = r.scheduled_start;
  const read = await readDemoTeams({
    organizerUpn: r.organizer_upn!,
    tutorUpn: r.tutor_upn ?? null,
    joinUrl: r.teams_join_url!,
    meetingId: r.teams_meeting_id ?? null,
    ref: r.ref_code || '',
    staffEmails: settings.hosts.map((h) => h.upn),
    start: start ?? now.toISOString(),
    minutes: r.scheduled_minutes || 45,
    wantTranscript: !!start && !r.transcript_found_at,
  });
  const attendance = read.attendance ?? r.teams_attendance ?? null;
  const patch: Record<string, unknown> = { teams_checked_at: now.toISOString(), teams_check_note: read.note };
  if (read.meetingId) patch.teams_meeting_id = read.meetingId;
  if (read.attendance) patch.teams_attendance = read.attendance;
  if (read.recordings) patch.recording_candidates = read.recordings;

  // Transcript: stored once, then its stats are evidence on every later check.
  const staffNames = [...(attendance ?? []).filter((a) => a.staff).map((a) => a.name), ...settings.hosts.map((h) => h.name)];
  let stats: DemoTranscriptStats | null = null;
  if (read.transcript) {
    const cues = parseDemoVtt(read.transcript.vtt);
    if (cues.length) {
      stats = demoTranscriptStats(cues, staffNames);
      const { error } = await supabase
        .from('demo_transcripts')
        .upsert({ registration_id: r.id, vtt: read.transcript.vtt, stats, transcript_id: read.transcript.id }, { onConflict: 'registration_id' });
      if (error) throw error;
      patch.transcript_found_at = now.toISOString();
    }
  } else if (r.transcript_found_at) {
    const { data } = await supabase.from('demo_transcripts').select('stats').eq('registration_id', r.id).maybeSingle();
    stats = (data?.stats as DemoTranscriptStats | null) ?? null;
  }

  // Recording: the real class's video, unless staff already chose.
  const pick = !r.recording_item_id && start ? autoPickRecording(read.recordings ?? [], start, r.scheduled_minutes || 45) : null;
  if (pick) {
    Object.assign(patch, {
      recording_drive_id: pick.driveId,
      recording_item_id: pick.itemId,
      recording_name: pick.name,
      recording_web_url: pick.webUrl,
      recording_picked_by: null,
      recording_picked_at: now.toISOString(),
    });
  }

  const verdict = start ? demoVerdict({ start, minutes: r.scheduled_minutes || 45, attendance, transcript: stats, now }) : null;
  if (verdict) patch.teams_verdict = { ...verdict, at: now.toISOString() };

  const { error } = await supabase.from('demo_class_registrations').update(patch).eq('id', r.id);
  if (error) throw error;

  const note = (outcome: string, text: string) =>
    logDemoRequestEvent({ registration_id: r.id, kind: 'note', outcome, note: text, actor_id: null }, supabase);
  if (pick) await note('recording_picked', `Recording picked automatically: ${pick.name}`);
  if (patch.transcript_found_at && stats) {
    await note('transcript_found', `Transcript saved: ${stats.minutes} min, ${stats.guestWords} words from the student.`);
  }

  // One timeline line the first time a guest shows up in Teams.
  const before = guestsWhoJoined(r.teams_attendance);
  const after = guestsWhoJoined(read.attendance);
  if (!before.length && after.length) {
    const who = after.map((g) => `${g.name} (${Math.max(1, Math.round(g.seconds / 60))} min)`).join(', ');
    await note('teams_joined', `Teams shows ${who} joined.`);
  }

  const action = verdictAction(r.status, r.attendance_source, verdict);
  if (action && verdict) {
    await applyVerdict({ ...r, ...(patch as Partial<DemoWithTeams>) }, action, verdict, supabase, now);
  } else if (verdict?.kind === 'unclear' && r.status === 'approved' && r.teams_verdict?.reason !== verdict.reason) {
    await note('teams_unclear', `Teams could not tell if the demo happened. ${verdict.reason}`);
  }
  return read.note;
}

/** Cron: a few due demos per run, newest first, so a class that just ended is decided within minutes. */
export async function sweepDemoTeams(now: Date = new Date()): Promise<number> {
  const supabase = getSupabaseAdminClient() as any;
  const { data, error } = await supabase
    .from('demo_class_registrations')
    .select('*')
    .in('status', ['approved', 'attended', 'no_show'])
    .not('graph_event_id', 'is', null)
    .gte('scheduled_start', new Date(now.getTime() - LOOKBACK_MS).toISOString())
    .lte('scheduled_start', new Date(now.getTime() - 10 * MIN).toISOString())
    .order('scheduled_start', { ascending: false })
    .limit(60);
  if (error) throw error;
  const due = ((data ?? []) as DemoWithTeams[]).filter((r) => needsTeamsCheck(r, now)).slice(0, PER_RUN);
  let done = 0;
  for (const r of due) {
    try {
      await syncDemoTeams(r, supabase, now);
      done++;
    } catch (err) {
      console.error('demo Teams check failed for', r.id, err);
    }
  }
  return done;
}
