/**
 * Aintra filling in the application with the student (2026-10-20).
 *
 * save_application_details writes the answers to the student's own draft
 * application, the one row the /apply form also saves and reopens, so they can
 * switch to the form at any point and find everything there. It is the one
 * tool that writes: a draft is private to the student, staff see it only as
 * an unfinished lead, and nothing is submitted until the student taps Submit
 * on the card that prepare_application_submit shows.
 */
import { createAdminClient, getActiveFeeStructures } from '@neram/database';
import { createApplication, getApplicationsByUserId } from '@neram/database/queries';
import { isE2ETestRun } from '@/lib/e2e-mode';
import { lookupPostalCode } from '@/lib/pincode-lookup';
import { formatBookMarker } from '../booking';
import {
  applicationGaps,
  applicationSummary,
  normaliseAnswers,
  programmeOfDuration,
  type ApplicationAnswers,
  type ApplicationRow,
  type ProgrammeId,
} from '../application';
import type { ToolContext, ToolResult } from './types';

const APPLY_CARD = formatBookMarker({ kind: 'apply', date: null, window: null });
const TTL_MS = 5 * 60 * 1000;

interface Programme {
  id: string;
  label: string;
  programme: ProgrammeId;
  courseType: string;
}

let programmesCache: { value: Programme[]; fetchedAt: number } | null = null;

/** The public programmes (what /apply offers), cached five minutes. */
export async function publicProgrammes(): Promise<Programme[]> {
  if (programmesCache && Date.now() - programmesCache.fetchedAt < TTL_MS) return programmesCache.value;
  const rows = (await getActiveFeeStructures({ excludeHidden: true }, createAdminClient() as any)) as any[];
  const value = rows
    .map((r) => ({ id: r.id, label: r.display_name, programme: programmeOfDuration(r.program_type, r.duration), courseType: r.course_type }))
    .filter((p): p is Programme => p.programme !== null);
  programmesCache = { value, fetchedAt: Date.now() };
  return value;
}

/** The programme for a course: a course-specific one first, else the one priced for both exams. */
export function pickProgramme(all: Programme[], programme: ProgrammeId, course: string): Programme | null {
  const matching = all.filter((p) => p.programme === programme);
  return matching.find((p) => p.courseType === course) ?? matching.find((p) => p.courseType === 'both') ?? null;
}

interface Applications {
  draft: ApplicationRow | null;
  submitted: ApplicationRow | null;
}

async function loadApplications(userId: string): Promise<Applications> {
  const apps = (await getApplicationsByUserId(createAdminClient() as any, userId)) as ApplicationRow[];
  return {
    draft: apps.find((a) => a.status === 'draft') ?? null,
    submitted: apps.find((a) => a.status && a.status !== 'draft' && a.status !== 'deleted') ?? null,
  };
}

const SIGN_IN_FIRST = {
  ok: true as const,
  data: {
    mode: 'needs_sign_in',
    next_step: 'The visitor signs in on the card (Google or phone). After that, ask the application questions here, one or two at a time.',
  },
  card: APPLY_CARD,
};

function alreadyApplied(submitted: ApplicationRow): ToolResult {
  return {
    ok: true,
    data: {
      mode: 'already_applied',
      application_number: submitted.application_number ?? null,
      status: submitted.status,
      note: 'They have already applied. Do not start another application; the card shows it.',
    },
    card: APPLY_CARD,
  };
}

export async function saveApplicationDetailsTool(args: ApplicationAnswers, ctx: ToolContext): Promise<ToolResult> {
  if (!ctx.userId) return SIGN_IN_FIRST;
  // The nightly E2E suite talks to production: it never writes an application.
  if (isE2ETestRun()) return { ok: false, error: 'test_mode' };
  try {
    const supabase = createAdminClient() as any;
    const { draft, submitted } = await loadApplications(ctx.userId);
    if (!draft && submitted) return alreadyApplied(submitted);

    const now = ctx.now ?? new Date();
    const { patch, rejected, programme, pincode } = normaliseAnswers(args, draft, now);

    if (programme) {
      const course = patch.interest_course ?? draft?.interest_course ?? null;
      if (!course || course === 'not_sure') {
        rejected.programme = 'ask which course first (NATA, JEE Paper 2 or both)';
      } else {
        const picked = pickProgramme(await publicProgrammes(), programme, course);
        if (picked) {
          patch.fee_structure_id = picked.id;
          patch.fee_source = 'standard';
        } else rejected.programme = 'that programme is not open right now';
      }
    }

    let place: string | null = null;
    if (pincode) {
      const found = await lookupPostalCode(pincode, 'IN', { timeoutMs: 1500 }).catch(() => null);
      if (found) {
        Object.assign(patch, { pincode, country: 'IN', city: found.city, district: found.district, state: found.state });
        place = [found.city, found.state].filter(Boolean).join(', ');
      } else {
        rejected.pincode = 'could not find this PIN code; ask them to check it';
      }
    }

    // The account's own verified number and email, so the form's checks pass.
    if (!draft?.phone && ctx.phone) patch.phone = ctx.phone;
    if (!draft?.email && ctx.email) patch.email = ctx.email;

    const saved = Object.keys(patch).filter((k) => !['phone', 'email', 'country', 'district', 'state', 'fee_source'].includes(k));
    let row: ApplicationRow = { ...(draft ?? {}), ...patch };
    if (Object.keys(patch).length) {
      if (draft?.id) {
        const { data, error } = await supabase.from('lead_profiles').update(patch).eq('id', draft.id).select().single();
        if (error) throw error;
        row = data;
      } else {
        row = (await createApplication(supabase, {
          user_id: ctx.userId,
          status: 'draft',
          source: 'website_form',
          country: 'IN',
          learning_mode: 'hybrid',
          form_step_completed: 1,
          ...patch,
        } as any)) as ApplicationRow;
      }
    }

    const stillNeeded = applicationGaps(row);
    return {
      ok: true,
      data: {
        saved,
        ...(place ? { pin_code_place: place } : {}),
        not_saved: Object.keys(rejected).length ? rejected : undefined,
        still_needed: stillNeeded,
        ready_to_submit: stillNeeded.length === 0,
        next_step: stillNeeded.length
          ? `Ask for: ${stillNeeded.slice(0, 2).join(' and ')}.`
          : 'Everything is in. Call prepare_application_submit to show the card.',
      },
    };
  } catch (err) {
    console.error('[aintra/save-application-details]', err);
    return { ok: false, error: 'tool_error' };
  }
}

export async function prepareApplicationSubmitTool(ctx: ToolContext): Promise<ToolResult> {
  if (!ctx.userId) return SIGN_IN_FIRST;
  try {
    const { draft, submitted } = isE2ETestRun() ? { draft: null, submitted: null } : await loadApplications(ctx.userId);
    if (!draft && submitted) return alreadyApplied(submitted);
    if (!draft) return { ok: false, error: 'no_application_yet', note: 'Nothing is saved yet. Ask the questions first.' };
    const gaps = applicationGaps(draft);
    if (gaps.length) return { ok: false, error: 'not_complete', still_needed: gaps };
    return {
      ok: true,
      data: {
        next_step: ctx.phoneVerified
          ? 'They check the summary on the card, tick the terms and tap Submit.'
          : 'They verify their phone on the card with a one-time code, tick the terms and tap Submit.',
      },
      card: APPLY_CARD,
    };
  } catch (err) {
    console.error('[aintra/prepare-application-submit]', err);
    return { ok: false, error: 'tool_error' };
  }
}

/**
 * The application lines of the system prompt, so Aintra knows what is saved
 * and what to ask next even after the early messages fall out of the history.
 * One small read for a signed-in visitor; nothing for a guest.
 */
export async function applicationPromptFor(userId: string | null): Promise<string> {
  if (!userId || isE2ETestRun()) return '';
  try {
    const { draft, submitted } = await loadApplications(userId);
    if (!draft && submitted) {
      return `\n\n## THIS VISITOR'S APPLICATION\nAlready applied${submitted.application_number ? ` (${submitted.application_number})` : ''}, status ${submitted.status}. Do not start another one.`;
    }
    if (!draft) return '';
    const programmes = draft.fee_structure_id ? await publicProgrammes().catch(() => []) : [];
    const label = programmes.find((p) => p.id === draft.fee_structure_id)?.label ?? null;
    const saved = applicationSummary(draft, label).map((r) => `${r.label}: ${r.value}`);
    const gaps = applicationGaps(draft);
    return (
      `\n\n## THIS VISITOR'S APPLICATION (draft, not submitted)\n` +
      `Saved: ${saved.length ? saved.join('; ') : 'nothing yet'}.\n` +
      (gaps.length
        ? `Still needed: ${gaps.join(', ')}. If they want to carry on, ask for the next one or two and save them with save_application_details.`
        : 'Everything is in. If they want to finish, call prepare_application_submit.')
    );
  } catch (err) {
    console.error('Aintra application note failed:', err);
    return '';
  }
}
