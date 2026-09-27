import { JOIN_REMINDER_DAYS, NOT_STARTED_DECISION_DAYS, normalizeReminderSchedule } from './not-started';

/**
 * The Not started schedule staff set on the Admin Settings page
 * (site_settings['lifecycle_rules']): which days after joining the automatic
 * "come into Nexus" reminders go out, and after how many days the Students page
 * asks staff to decide.
 *
 * Never throws. A missing row, a missing table or a bad value gives the built-in
 * defaults, so a settings problem cannot stop the reminder cron or the roster.
 */
export interface NotStartedSchedule {
  joinReminderDays: number[];
  decisionDays: number;
}

export const DEFAULT_NOT_STARTED_SCHEDULE: NotStartedSchedule = {
  joinReminderDays: [...JOIN_REMINDER_DAYS],
  decisionDays: NOT_STARTED_DECISION_DAYS,
};

/** Pure: turn the stored rules object into a safe schedule. */
export function scheduleFromRules(value: unknown): NotStartedSchedule {
  const rules = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const decision = rules.not_started_decision_days;
  return {
    joinReminderDays: normalizeReminderSchedule(
      Array.isArray(rules.join_reminder_days) ? (rules.join_reminder_days as number[]) : null,
    ),
    decisionDays:
      Number.isInteger(decision) && (decision as number) >= 3 && (decision as number) <= 60
        ? (decision as number)
        : NOT_STARTED_DECISION_DAYS,
  };
}

/** The one query this needs; any Supabase client satisfies it. */
interface SettingsReader {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<{ data: { value?: unknown } | null; error: unknown }>;
      };
    };
  };
}

export async function readNotStartedSchedule(supabase: SettingsReader): Promise<NotStartedSchedule> {
  try {
    const { data, error } = await supabase.from('site_settings').select('value').eq('key', 'lifecycle_rules').maybeSingle();
    if (error || !data) return DEFAULT_NOT_STARTED_SCHEDULE;
    return scheduleFromRules(data.value);
  } catch {
    return DEFAULT_NOT_STARTED_SCHEDULE;
  }
}
