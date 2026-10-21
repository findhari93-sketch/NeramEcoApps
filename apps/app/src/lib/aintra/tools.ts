/**
 * Aintra's tools in the student app (2026-10-20): the declarations Gemini
 * sees and what each one reads. Every read is the signed-in student's own,
 * from the verified token; nothing here writes. A ticket and the exam year are
 * changed only when the student taps the card, through the app's own routes.
 */
import {
  formatDemoPreference,
  formatDueDate,
  getActiveDemoRequestForUser,
  getExamYearStatus,
  getSupabaseAdminClient,
  listUserNotifications,
  resolveDemoSettings,
  type DemoWindow,
} from '@neram/database';
import { loadBalanceDue } from '@neram/database/fee-payment-claims';
import {
  NO_FEES,
  planExamYear,
  planFees,
  planNotifications,
  planOpenAsk,
  planSavedColleges,
  planStatus,
  planTicket,
  type FeeFacts,
  type ToolOutcome,
} from './plan';
import { marketingLink } from './cards';

export interface AintraUser {
  id: string;
  name: string | null;
  phoneVerified: boolean;
}

export const TOOL_DECLARATIONS = [
  {
    name: 'get_my_account',
    description:
      'The student\'s own application status, demo class, callback and anything they owe, as a card with buttons to each. Use for "what is my status", "did my application go through", "is my demo confirmed".',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_my_fees',
    description:
      'What the student owes right now (next instalment, an approved application\'s fee, an enrolment link) with a button to the page that takes each payment. Nothing is paid in the chat.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'prepare_ticket',
    description:
      'Write up a support ticket for a problem our team must fix (enrolment, payment, account, the app, a course question). The student checks it on a card and taps Raise ticket.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['enrollment_issue', 'payment_issue', 'technical_issue', 'account_issue', 'course_question', 'other'] },
        subject: { type: 'string', description: 'A short subject.' },
        description: { type: 'string', description: 'What went wrong, in their words (at least a sentence).' },
      },
      required: ['description'],
    },
  },
  {
    name: 'prepare_exam_year',
    description: 'Set or change the year the student will write NATA or JEE B.Arch. They confirm it on a card.',
    parameters: {
      type: 'object',
      properties: { year: { type: 'number', description: 'The exam year, e.g. 2027. Leave out to let them pick.' } },
    },
  },
  {
    name: 'get_saved_colleges',
    description: 'The colleges the student saved to their shortlist.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_notifications',
    description: 'The student\'s latest notifications and how many are new.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'open_ask',
    description:
      'For any calculation or prediction (cutoff marks, college chances, rank, exam centres, eligibility, cost): hand the question to Ask aiArchitek, which works it out from our data. Never calculate these yourself.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Their question, in their words.' },
        tool: {
          type: 'string',
          enum: ['cutoff', 'college_predictor', 'rank_predictor', 'josaa', 'exam_centres', 'eligibility', 'question_bank', 'cost'],
          description: 'The tool page that fits, if one does.',
        },
      },
    },
  },
] as const;

export const TOOL_STATUS: Record<string, string> = {
  get_my_account: 'Checking your account',
  get_my_fees: 'Checking your fees',
  prepare_ticket: 'Writing up your ticket',
  prepare_exam_year: 'Getting your exam year',
  get_saved_colleges: 'Getting your saved colleges',
  get_notifications: 'Checking your notifications',
  open_ask: 'Getting the right tool',
};

const db = () => getSupabaseAdminClient() as any;

async function loadFees(userId: string, now: Date): Promise<FeeFacts> {
  const s = db();
  const [due, claims, apps, links] = await Promise.all([
    loadBalanceDue(s, userId).catch(() => null),
    s.from('fee_payment_claims').select('amount').eq('user_id', userId).eq('status', 'pending').limit(1),
    s
      .from('lead_profiles')
      .select('id, application_number, final_fee')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1),
    s
      .from('direct_enrollment_links')
      .select('token, final_fee, offer_full_amount')
      .eq('user_id', userId)
      .eq('payment_mode', 'student_pays')
      .eq('status', 'active')
      .gt('expires_at', now.toISOString())
      .order('created_at', { ascending: false })
      .limit(1),
  ]);
  const claim = claims?.data?.[0];
  const app = apps?.data?.[0];
  const link = links?.data?.[0];
  return {
    balance: due?.amount ? { amount: due.amount, installmentNumber: due.installmentNumber, dueLabel: due.dueDate ? formatDueDate(due.dueDate) : null } : null,
    pendingClaim: claim ? { amount: Number(claim.amount) || 0 } : null,
    approvedApplication: app?.application_number ? { leadId: app.id, number: app.application_number, fee: app.final_fee != null ? Number(app.final_fee) : null } : null,
    enrolmentLink: link?.token ? { token: link.token, amount: Number(link.offer_full_amount ?? link.final_fee) || null } : null,
  };
}

async function loadAccount(userId: string, now: Date) {
  const s = db();
  const [fees, demo, settingsRow, callbacks, apps] = await Promise.all([
    loadFees(userId, now),
    getActiveDemoRequestForUser(userId, s).catch(() => null),
    s.from('site_settings').select('value').eq('key', 'demo_class').maybeSingle(),
    s
      .from('callback_requests')
      .select('preferred_date, preferred_slot')
      .eq('user_id', userId)
      .in('status', ['pending', 'scheduled', 'attempted'])
      .not('query_type', 'in', '(post_demo,demo_rebook)')
      .order('created_at', { ascending: false })
      .limit(1),
    s
      .from('lead_profiles')
      .select('id, status, application_number')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .neq('status', 'deleted')
      .order('created_at', { ascending: false })
      .limit(1),
  ]);
  const schedule = resolveDemoSettings(settingsRow?.data?.value).schedule;
  const cb = callbacks?.data?.[0];
  const app = apps?.data?.[0];
  return {
    fees,
    demo: demo
      ? { ref: demo.ref_code || '', status: demo.status, when: formatDemoPreference(demo.preferred_date, demo.preferred_window as DemoWindow, schedule) }
      : null,
    callback: cb ? { when: [cb.preferred_date, cb.preferred_slot].filter(Boolean).join(' ') || 'any time' } : null,
    application: app ? { leadId: app.id, number: app.application_number ?? null, status: app.status } : null,
  };
}

/** Runs one tool for the signed-in student. Never throws: a failure is a result the model can explain. */
export async function runTool(name: string, args: Record<string, unknown>, user: AintraUser, now = new Date()): Promise<ToolOutcome> {
  try {
    switch (name) {
      case 'get_my_account':
        return planStatus(await loadAccount(user.id, now));
      case 'get_my_fees':
        return planFees(await loadFees(user.id, now).catch(() => NO_FEES));
      case 'prepare_ticket':
        return planTicket(args);
      case 'prepare_exam_year': {
        const status = await getExamYearStatus(db(), user.id).catch(() => null);
        if (status?.source === 'batch') {
          return { forModel: { ok: false, error: 'set_by_their_batch', year: status.year, note: 'Their class batch fixes the exam year; our team changes it if it is wrong.' } };
        }
        return planExamYear(args, status?.year ?? null, now);
      }
      case 'get_saved_colleges': {
        const { data } = await db()
          .from('user_saved_colleges')
          .select('created_at, colleges:college_id (name, slug, state_slug, city)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20);
        const rows = (data ?? [])
          .map((r: any) => r.colleges)
          .filter(Boolean)
          .map((c: any) => ({ name: c.name, city: c.city ?? null, href: marketingLink(`/colleges/${c.state_slug ?? 'india'}/${c.slug}`) }));
        return planSavedColleges(rows);
      }
      case 'get_notifications': {
        const { notifications } = await listUserNotifications(user.id, { limit: 5 }, db());
        return planNotifications(notifications.map((n) => ({ title: n.title, message: n.message, isRead: n.is_read, at: n.created_at })));
      }
      case 'open_ask':
        return planOpenAsk(args);
      default:
        return { forModel: { ok: false, error: 'unknown_tool' } };
    }
  } catch (err) {
    console.error(`[aintra/app] ${name} failed:`, err);
    return { forModel: { ok: false, error: 'tool_error' } };
  }
}
