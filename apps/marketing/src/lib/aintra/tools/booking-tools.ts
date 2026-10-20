/**
 * The booking tools' reads: demo settings, the visitor's open demo, callback,
 * application and exam year. Read only, and only for the user in the verified
 * ToolContext. The rules live in booking-plan.ts.
 */
import { createAdminClient, getActiveDemoRequestForUser, getExamYearStatus } from '@neram/database';
import { loadDemoSettings } from '@/lib/demo-request';
import { isE2ETestRun } from '@/lib/e2e-mode';
import { describeMyStatus, planCallback, planDemoBooking, planDemoCancel, type ActiveDemo, type DemoFacts } from './booking-plan';
import type { PrepareCallbackArgs, PrepareDemoBookingArgs, PrepareDemoCancelArgs, ToolContext, ToolResult } from './types';

const SETTINGS_TTL_MS = 5 * 60 * 1000;
let settingsCache: { value: Awaited<ReturnType<typeof loadDemoSettings>>; fetchedAt: number } | null = null;

/** Demo settings, cached for five minutes (shared with the chat prompt). */
export async function cachedDemoSettings() {
  if (settingsCache && Date.now() - settingsCache.fetchedAt < SETTINGS_TTL_MS) return settingsCache.value;
  const value = await loadDemoSettings();
  settingsCache = { value, fetchedAt: Date.now() };
  return value;
}

function signedInUser(ctx: ToolContext): string | null {
  // The nightly E2E suite talks to production: it never reads a real person's records.
  return ctx.userId && !isE2ETestRun() ? ctx.userId : null;
}

async function activeDemo(userId: string | null): Promise<ActiveDemo | null> {
  if (!userId) return null;
  const demo = await getActiveDemoRequestForUser(userId, createAdminClient() as any);
  return demo
    ? { ref: demo.ref_code || '', status: demo.status, preferredDate: demo.preferred_date, preferredWindow: demo.preferred_window }
    : null;
}

async function demoFacts(ctx: ToolContext): Promise<DemoFacts> {
  const userId = signedInUser(ctx);
  const [settings, existing, examYear] = await Promise.all([
    cachedDemoSettings(),
    activeDemo(userId),
    userId ? getExamYearStatus(createAdminClient() as any, userId).catch(() => null) : null,
  ]);
  return {
    schedule: settings.schedule,
    signedIn: !!ctx.userId,
    phoneVerified: ctx.phoneVerified,
    accountName: ctx.name,
    knownExamYear: examYear?.year ?? null,
    existing,
  };
}

export async function prepareDemoBookingTool(args: PrepareDemoBookingArgs, ctx: ToolContext): Promise<ToolResult> {
  try {
    return planDemoBooking(args, await demoFacts(ctx), ctx.now ?? new Date());
  } catch (err) {
    console.error('[aintra/prepare-demo-booking]', err);
    return { ok: false, error: 'tool_error' };
  }
}

export async function prepareDemoCancelTool(args: PrepareDemoCancelArgs, ctx: ToolContext): Promise<ToolResult> {
  try {
    const [settings, existing] = await Promise.all([cachedDemoSettings(), activeDemo(signedInUser(ctx))]);
    return planDemoCancel(args, { signedIn: !!ctx.userId, existing, schedule: settings.schedule });
  } catch (err) {
    console.error('[aintra/prepare-demo-cancel]', err);
    return { ok: false, error: 'tool_error' };
  }
}

export async function prepareCallbackTool(args: PrepareCallbackArgs, ctx: ToolContext): Promise<ToolResult> {
  return planCallback(args, !!ctx.userId, ctx.now ?? new Date());
}

export async function getMyStatusTool(ctx: ToolContext): Promise<ToolResult> {
  const userId = signedInUser(ctx);
  try {
    const supabase = createAdminClient() as any;
    const [settings, demo, callbacks, applications] = await Promise.all([
      cachedDemoSettings(),
      activeDemo(userId),
      userId
        ? supabase
            .from('callback_requests')
            .select('preferred_date, preferred_slot')
            .eq('user_id', userId)
            .in('status', ['pending', 'scheduled', 'attempted'])
            .not('query_type', 'in', '(post_demo,demo_rebook)')
            .order('created_at', { ascending: false })
            .limit(1)
        : { data: null },
      userId
        ? supabase
            .from('lead_profiles')
            .select('status, application_number')
            .eq('user_id', userId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(1)
        : { data: null },
    ]);
    const cb = callbacks?.data?.[0];
    const app = applications?.data?.[0];
    return describeMyStatus({
      signedIn: !!ctx.userId,
      schedule: settings.schedule,
      demo,
      callback: cb ? { preferredDate: cb.preferred_date, preferredSlot: cb.preferred_slot } : null,
      application: app ? { status: app.status, applicationNumber: app.application_number } : null,
    });
  } catch (err) {
    console.error('[aintra/get-my-status]', err);
    return { ok: false, error: 'tool_error' };
  }
}
