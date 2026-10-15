/**
 * Record a demo that happened outside the desk (Google Meet, a call, in person).
 * Used by Add demo ("Demo already held") and by the request panel's
 * "Demo already held" action on an open request. Server only.
 */
import {
  createDemoRequestWithRef,
  updateDemoRequest,
  logDemoRequestEvent,
  enqueueDemoMessages,
  cancelPendingDemoMessages,
  thanksSendAfter,
  formatDemoDateTime,
  istDateKey,
  openDemoFollowUp,
  rebookFollowUpAt,
  staffUserIdsByUpn,
  type CreateDemoRequestInput,
  type DemoRequest,
  type InterestLevel,
  type TypedSupabaseClient,
} from '@neram/database';
import { loadDemoSettings } from './server';
import { DEFAULT_HELD_TUTOR, STAFF_DEMO_PLATFORMS, heldTutorOptions } from './staff-add';

export class HeldDemoError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export interface HeldDemo {
  at: Date;
  platform: (typeof STAFF_DEMO_PLATFORMS)[number];
  attended: boolean;
  interest: InterestLevel | null;
  nextAt: Date | null;
  note: string;
  joinUrl: string | null;
  sendFollowUp: boolean;
  /** Lowercase UPN of whoever took the demo. */
  tutorUpn: string;
}

function str(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/**
 * Validate the held-demo fields from a request body before anything is written.
 * `tutorUpns` are the allowed "Who took it" choices (lowercase).
 */
export function parseHeldDemo(body: Record<string, unknown>, tutorUpns: string[], now = new Date()): HeldDemo {
  const at = new Date(str(body.heldAt, 40));
  if (Number.isNaN(at.getTime())) throw new HeldDemoError('Pick when the demo happened.');
  if (at.getTime() > now.getTime() + 5 * 60_000) throw new HeldDemoError('That time is in the future. Use "Time already agreed" instead.');
  const platform = STAFF_DEMO_PLATFORMS.find((p) => p.id === str(body.platform, 20));
  if (!platform) throw new HeldDemoError('Pick where the demo happened.');
  const attended = body.outcome !== 'no_show';
  const interest = ['hot', 'warm', 'cold'].includes(String(body.interest)) ? (body.interest as InterestLevel) : null;
  const nextAt = typeof body.nextFollowUpAt === 'string' ? new Date(body.nextFollowUpAt) : null;
  if (attended && (!interest || !nextAt || Number.isNaN(nextAt.getTime()))) {
    throw new HeldDemoError('Pick how interested they are and the first follow-up date.');
  }
  if (attended && nextAt!.getTime() <= now.getTime()) throw new HeldDemoError('Pick a follow-up date in the future.');
  const tutorIn = str(body.tutorUpn, 200).toLowerCase();
  const tutorUpn = tutorIn || DEFAULT_HELD_TUTOR.upn;
  if (!tutorUpns.includes(tutorUpn)) throw new HeldDemoError('Pick who took the demo from the demo team.');
  const joinUrl = str(body.joinUrl, 500);
  return {
    at,
    platform,
    attended,
    interest: attended ? interest : null,
    nextAt: attended ? nextAt : null,
    note: str(body.note, 1000),
    joinUrl: /^https:\/\/\S+\.\S+/.test(joinUrl) ? joinUrl : null,
    sendFollowUp: body.sendFollowUp === true,
    tutorUpn,
  };
}

/** parseHeldDemo with the tutor choices read from Demo settings. */
export async function parseHeldDemoWithSettings(body: Record<string, unknown>, supabase: TypedSupabaseClient) {
  const settings = await loadDemoSettings(supabase);
  const tutors = heldTutorOptions(settings.hosts);
  const held = parseHeldDemo(body, tutors.map((t) => t.upn));
  return { held, settings, tutorName: tutors.find((t) => t.upn === held.tutorUpn)?.name ?? held.tutorUpn };
}

/**
 * Write the held demo. `existing` is an open request to close out (it keeps its
 * own channel and page code, so website attribution is not lost); otherwise a
 * new staff-added row is created from `create`. `patch` carries details staff
 * typed that should land on the existing request too (name, class, parent).
 */
export async function recordHeldDemo(opts: {
  supabase: TypedSupabaseClient;
  actorId: string | null;
  userId: string | null;
  held: HeldDemo;
  minutes: number;
  tutorName: string;
  existing: DemoRequest | null;
  create?: Omit<CreateDemoRequestInput, 'ref_code' | 'join_token' | 'preferred_date' | 'preferred_window'>;
  patch?: Partial<DemoRequest>;
  /** Extra words for the activity log, e.g. "Added by staff from WhatsApp to the office." */
  source: string;
}): Promise<{ row: DemoRequest; queued: boolean }> {
  const { supabase, actorId, userId, held, minutes, existing } = opts;
  const staffIds = await staffUserIdsByUpn([held.tutorUpn], supabase);
  const fields: Partial<DemoRequest> = {
    status: held.attended ? 'attended' : 'no_show',
    attended: held.attended,
    attendance_marked_at: new Date().toISOString(),
    scheduled_start: held.at.toISOString(),
    scheduled_minutes: minutes,
    tutor_upn: held.tutorUpn,
    host_user_id: staffIds[held.tutorUpn] ?? null,
    ...(held.joinUrl ? { teams_join_url: held.joinUrl } : {}),
  };

  let row: DemoRequest;
  if (existing) {
    row = await updateDemoRequest(existing.id, { ...(opts.patch ?? {}), ...fields, next_contact_at: null }, supabase);
    // Reminders for a time that no longer applies, call-backs, "received" retries.
    await cancelPendingDemoMessages(existing.id, undefined, supabase);
  } else {
    if (!opts.create) throw new HeldDemoError('Nothing to record.');
    row = await createDemoRequestWithRef(
      {
        ...opts.create,
        preferred_date: istDateKey(held.at),
        preferred_window: 'anytime',
        ...(fields as Partial<CreateDemoRequestInput>),
      },
      supabase,
    );
  }
  await (supabase as any).from('demo_class_registrations').update({ attendance_marked_by: actorId }).eq('id', row.id);

  await logDemoRequestEvent(
    {
      registration_id: row.id,
      kind: 'status',
      outcome: held.attended ? 'attended' : 'no_show',
      note: (
        `Held outside the desk on ${held.platform.label}, ${formatDemoDateTime(held.at)}, taken by ${opts.tutorName}. ` +
        `${opts.source} ` +
        (held.attended && held.interest ? `Interest ${held.interest}. ` : '') +
        held.note
      )
        .replace(/\s+/g, ' ')
        .trim(),
      actor_id: actorId,
    },
    supabase,
  );

  if (userId) {
    await openDemoFollowUp(
      held.attended
        ? { userId, demoRegistrationId: row.id, kind: 'post_demo', dueAt: held.nextAt!, interest: held.interest, note: held.note || null, actorId }
        : { userId, demoRegistrationId: row.id, kind: 'demo_rebook', dueAt: rebookFollowUpAt(new Date()), actorId },
      supabase,
    );
  }

  let queued = false;
  if (held.sendFollowUp) {
    const now = new Date();
    await enqueueDemoMessages(
      row,
      [held.attended ? { kind: 'thanks', sendAfter: thanksSendAfter(held.at, minutes, now) } : { kind: 'missed', sendAfter: now }],
      supabase,
    );
    queued = true;
  }
  return { row, queued };
}
