import { claimDraftsForDemoNudge, sendApplyDraftDemoNudge } from '@neram/database';

export interface DraftNudgeSummary {
  enabled: boolean;
  sent: number;
  failed: number;
}

/** 10:00 to 19:00 in India: nobody gets a sales-ish WhatsApp at night. */
export function inDraftNudgeHours(now: Date): boolean {
  const istHour = (now.getUTCHours() + 5 + Math.floor((now.getUTCMinutes() + 30) / 60)) % 24;
  return istHour >= 10 && istHour < 19;
}

/**
 * The "not sure yet? book a free demo" WhatsApp for unfinished applications.
 * Off unless APPLY_DRAFT_DEMO_NUDGE=on, which waits on Meta approving the
 * `apply_draft_demo` template. Runs inside the demo-messages cron, so it adds
 * no invocations of its own.
 */
export async function sendApplyDraftDemoNudges(now = new Date()): Promise<DraftNudgeSummary> {
  const summary: DraftNudgeSummary = { enabled: false, sent: 0, failed: 0 };
  if (process.env.APPLY_DRAFT_DEMO_NUDGE !== 'on' || !inDraftNudgeHours(now)) return summary;
  summary.enabled = true;

  const due = await claimDraftsForDemoNudge({ now, limit: 20 });
  for (const nudge of due) {
    const result = await sendApplyDraftDemoNudge(nudge.phone, nudge.name);
    if (result.success) summary.sent++;
    else {
      summary.failed++;
      console.error(`apply draft demo nudge failed for lead ${nudge.leadProfileId}:`, result.error);
    }
  }
  return summary;
}
