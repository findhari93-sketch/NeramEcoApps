/**
 * The rules of Aintra's jobs in the student app, as pure functions: what a
 * tool tells the model, and the card the student sees. The reads live in
 * tools.ts. Nothing here writes.
 *
 * What the model gets is words; the card gets the links. A pay-yourself
 * enrolment link carries a secret token, so it goes on the card only.
 */
import { isPlausibleStatedExamYear, examYearChoices } from '@neram/database/academic-year';
import { marketingLink, type AintraCard, type CardLink } from './cards';

export interface ToolOutcome {
  /** What the model reads (no links with secrets). */
  forModel: Record<string, unknown>;
  card?: AintraCard;
}

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const DEMO_STATUS: Record<string, string> = {
  pending: 'requested, our team will call to fix the time',
  contacted: 'our team has called',
  approved: 'confirmed, the Teams link is on WhatsApp',
};

const APPLICATION_STATUS: Record<string, string> = {
  draft: 'started, not submitted yet',
  pending_verification: 'submitted, waiting for phone verification',
  submitted: 'submitted, our team is reviewing it',
  under_review: 'our team is reviewing it',
  approved: 'approved, the next step is paying the fee',
  partial_payment: 'enrolled, part of the fee paid',
  enrolled: 'enrolled',
  rejected: 'not accepted',
};

export interface StatusFacts {
  demo: { ref: string; status: string; when: string } | null;
  callback: { when: string } | null;
  application: { leadId: string; number: string | null; status: string } | null;
  fees: FeeFacts;
}

export interface FeeFacts {
  balance: { amount: number; installmentNumber: number | null; dueLabel: string | null } | null;
  pendingClaim: { amount: number } | null;
  approvedApplication: { leadId: string; number: string; fee: number | null } | null;
  enrolmentLink: { token: string; amount: number | null } | null;
}

export const NO_FEES: FeeFacts = { balance: null, pendingClaim: null, approvedApplication: null, enrolmentLink: null };

/** The buttons for what they owe, most urgent first. */
export function feeLinks(f: FeeFacts): CardLink[] {
  const links: CardLink[] = [];
  if (f.enrolmentLink) {
    links.push({
      label: `Finish your enrolment${f.enrolmentLink.amount ? ` and pay ${rupees(f.enrolmentLink.amount)}` : ''}`,
      href: marketingLink(`/enroll?token=${encodeURIComponent(f.enrolmentLink.token)}`),
      external: true,
    });
  }
  if (f.approvedApplication) {
    links.push({
      label: `Pay the course fee${f.approvedApplication.fee ? ` (${rupees(f.approvedApplication.fee)})` : ''}`,
      href: `/payment/${encodeURIComponent(f.approvedApplication.leadId)}`,
    });
  }
  if (f.balance && !f.pendingClaim) {
    const parts = [f.balance.installmentNumber ? `instalment ${f.balance.installmentNumber}` : null, f.balance.dueLabel ? `due ${f.balance.dueLabel}` : null].filter(Boolean);
    links.push({ label: `Pay ${rupees(f.balance.amount)}${parts.length ? ` (${parts.join(', ')})` : ''}`, href: marketingLink('/pay-balance'), external: true });
  }
  return links.map((l, i) => ({ ...l, primary: i === 0 }));
}

function feeWords(f: FeeFacts): Record<string, unknown> {
  const owes = feeLinks(f).map((l) => l.label);
  return {
    owes_now: owes.length ? owes : 'nothing right now',
    ...(f.pendingClaim ? { waiting_for_our_team: `${rupees(f.pendingClaim.amount)} they sent is waiting for our team to verify` } : {}),
  };
}

export function planFees(f: FeeFacts): ToolOutcome {
  const links = feeLinks(f);
  return {
    forModel: { ...feeWords(f), how_they_pay: links.length ? 'Each button on the card opens the page that takes that payment. Nothing is paid in the chat.' : 'Nothing to pay.' },
    card: {
      kind: 'links',
      title: links.length ? 'Your fees' : 'Nothing to pay right now',
      lines: f.pendingClaim ? [{ label: 'Waiting for our team', value: `${rupees(f.pendingClaim.amount)} you sent, being verified` }] : [],
      links,
      note: links.length ? 'Each button opens the payment page. Nothing is paid in the chat.' : undefined,
    },
  };
}

export function planStatus(s: StatusFacts): ToolOutcome {
  const lines: { label: string; value: string }[] = [];
  const links: CardLink[] = [];
  if (s.application) {
    lines.push({
      label: 'Application',
      value: `${s.application.number ? `${s.application.number}: ` : ''}${APPLICATION_STATUS[s.application.status] ?? s.application.status}`,
    });
    links.push(s.application.status === 'draft' ? { label: 'Finish my application', href: '/apply' } : { label: 'View my application', href: '/my-applications' });
  }
  if (s.demo) {
    lines.push({ label: 'Demo class', value: `${s.demo.when}, ${DEMO_STATUS[s.demo.status] ?? s.demo.status} (ref ${s.demo.ref})` });
    links.push({ label: 'Manage my demo class', href: marketingLink('/demo-class/my'), external: true });
  }
  if (s.callback) lines.push({ label: 'Callback', value: `asked for ${s.callback.when}` });
  links.push(...feeLinks(s.fees));
  if (s.fees.pendingClaim) lines.push({ label: 'Payment', value: `${rupees(s.fees.pendingClaim.amount)} you sent is being verified` });
  if (!lines.length && !links.length) {
    lines.push({ label: 'Nothing yet', value: 'No application, demo class or fee on your account.' });
    links.push({ label: 'Start my application', href: '/apply' }, { label: 'Book a free demo class', href: marketingLink('/demo-class'), external: true });
  }
  return {
    forModel: {
      application: s.application ? lines.find((l) => l.label === 'Application')?.value : 'none',
      demo_class: s.demo ? lines.find((l) => l.label === 'Demo class')?.value : 'none',
      callback: s.callback ? s.callback.when : 'none',
      ...feeWords(s.fees),
      note: 'The card shows all of this with buttons. Summarise in one or two sentences.',
    },
    card: { kind: 'links', title: 'Your account', lines, links: links.map((l, i) => ({ ...l, primary: i === 0 })) },
  };
}

/** The support ticket categories (SupportTicketCategory). */
export const TICKET_CATEGORIES = ['enrollment_issue', 'payment_issue', 'technical_issue', 'account_issue', 'course_question', 'other'] as const;

const oneLine = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';

export function planTicket(args: { category?: unknown; subject?: unknown; description?: unknown }): ToolOutcome {
  const description = oneLine(args?.description, 2000);
  if (description.length < 10) return { forModel: { ok: false, error: 'describe_the_problem', note: 'Ask what went wrong, in a sentence or two.' } };
  const category = (TICKET_CATEGORIES as readonly string[]).includes(String(args?.category)) ? String(args?.category) : 'other';
  const subject = oneLine(args?.subject, 120) || description.slice(0, 80);
  return {
    forModel: { ok: true, subject, category, next_step: 'They check the ticket on the card and tap "Raise ticket". Nothing is sent until they do.' },
    card: { kind: 'ticket', category, subject, description },
  };
}

export function planExamYear(args: { year?: unknown }, current: number | null, now = new Date()): ToolOutcome {
  const year = Number(args?.year);
  const choices = examYearChoices(now);
  if (args?.year !== undefined && !isPlausibleStatedExamYear(year, now)) {
    return { forModel: { ok: false, error: 'not_a_coming_exam_year', choices } };
  }
  const picked = args?.year !== undefined ? year : current;
  return {
    forModel: {
      ok: true,
      current: current ?? 'not set',
      proposed: picked ?? 'they pick on the card',
      next_step: 'They confirm the year on the card. It is saved only when they tap Save.',
    },
    card: { kind: 'exam-year', year: picked ?? null, choices },
  };
}

export function planSavedColleges(rows: { name: string; city: string | null; href: string }[]): ToolOutcome {
  return {
    forModel: { count: rows.length, colleges: rows.slice(0, 10).map((r) => r.name) },
    card: {
      kind: 'links',
      title: rows.length ? `Your saved colleges (${rows.length})` : 'No saved colleges yet',
      lines: rows.slice(0, 6).map((r) => ({ label: r.name, value: r.city ?? '' })),
      links: [
        rows.length ? { label: 'Open my saved colleges', href: '/saved-colleges', primary: true } : { label: 'Find colleges', href: marketingLink('/colleges'), external: true, primary: true },
      ],
    },
  };
}

export function planNotifications(rows: { title: string; message: string; isRead: boolean; at: string }[]): ToolOutcome {
  const unread = rows.filter((r) => !r.isRead);
  return {
    forModel: {
      unread: unread.length,
      latest: rows.slice(0, 5).map((r) => `${r.isRead ? '' : '(new) '}${r.title}: ${r.message}`.slice(0, 200)),
    },
    card: {
      kind: 'links',
      title: unread.length ? `${unread.length} new notification${unread.length === 1 ? '' : 's'}` : 'You are all caught up',
      lines: rows.slice(0, 5).map((r) => ({ label: r.title, value: r.message.slice(0, 140) })),
      links: [],
      note: 'Open the bell at the top for the full list.',
    },
  };
}

/** Where each calculator or tool lives in the app, for the /ask hand-off. */
export const TOOL_PAGES: Record<string, { label: string; href: string }> = {
  cutoff: { label: 'Cutoff calculator', href: '/tools/nata/cutoff-calculator' },
  college_predictor: { label: 'College predictor', href: '/tools/counseling/college-predictor' },
  rank_predictor: { label: 'Rank predictor', href: '/tools/counseling/rank-predictor' },
  josaa: { label: 'JoSAA predictor', href: '/tools/counseling/josaa-predictor' },
  exam_centres: { label: 'NATA exam centres', href: '/tools/nata/exam-centers' },
  eligibility: { label: 'Eligibility checker', href: '/tools/nata/eligibility-checker' },
  question_bank: { label: 'Question bank', href: '/tools/nata/question-bank' },
  cost: { label: 'Cost calculator', href: '/tools/nata/cost-calculator' },
};

/**
 * Calculators and predictions run in Ask aiArchitek (/ask) for now, with every
 * number from a tool. Aintra hands the question over with one tap.
 */
export function planOpenAsk(args: { question?: unknown; tool?: unknown }): ToolOutcome {
  const question = oneLine(args?.question, 300);
  const tool = TOOL_PAGES[String(args?.tool ?? '')];
  const links: CardLink[] = [];
  if (question) links.push({ label: 'Work it out in Ask aiArchitek', href: `/ask?q=${encodeURIComponent(question)}`, primary: true });
  if (tool) links.push({ label: `Open the ${tool.label}`, href: tool.href, primary: !question });
  if (!links.length) links.push({ label: 'Open Ask aiArchitek', href: '/ask', primary: true });
  return {
    forModel: { ok: true, next_step: 'The card opens Ask aiArchitek with their question, where every number comes from our data. Do not calculate it yourself.' },
    card: { kind: 'links', title: 'Calculators and predictions', lines: question ? [{ label: 'Your question', value: question }] : [], links },
  };
}
