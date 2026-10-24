/**
 * The class account an enrolled student gets when staff verify their payment:
 * a Microsoft account, a license, the link to their Neram record, the year
 * classroom, its Team, and a welcome email.
 *
 * Unlike Nexus's Create account (which starts from a name typed into a form and
 * must first ask "is this someone we already have?"), this always starts from a
 * known, enrolled student record, so there is no duplicate question.
 *
 * Resumable: every step is saved as it finishes, and a second run skips what is
 * done. A failure stops at that step and keeps the earlier ones, so Retry carries
 * on from there, and a half-made account is never thrown away.
 *
 * The start password is the one staff have always given (Radhika@123) with a
 * forced change at the first sign-in. It is never stored or logged: the setup
 * page derives it from the first name, and only shows it to the signed-in
 * student until they have chosen their own. If Microsoft refuses it, a random
 * one is used instead and returned once to staff.
 */

import type { GraphErrorInfo } from '../graph';
import type { CreateEntraUserInput, GraphResult } from './entra';
import {
  STUDENT_JOB_TITLE,
  isValidUsername,
  normalizeUsername,
  startPassword,
  studentDepartment,
  suggestUsernameFromFather,
  upnFor,
  type StudentAccountDefaults,
} from './rules';

export const CLASS_STEP_KEYS = ['account', 'licence', 'link', 'classroom', 'teams', 'welcome'] as const;
export type ClassStepKey = (typeof CLASS_STEP_KEYS)[number];

export interface ClassStep {
  status: 'pending' | 'done' | 'failed' | 'skipped';
  at?: string;
  message?: string;
}

export type ClassSteps = Record<ClassStepKey, ClassStep>;

export interface ClassAccountSetup {
  userId: string;
  upn: string;
  msOid: string | null;
  passwordMode: 'start' | 'random';
  accountCreatedAt: string | null;
  steps: ClassSteps;
  createdBy: string | null;
}

export interface ClassAccountStudent {
  id: string;
  firstName: string;
  lastName: string | null;
  fatherName: string | null;
  /** Ten digits, or null. */
  phone: string | null;
  personalEmail: string | null;
  msOid: string | null;
  isStaff: boolean;
  isStudent: boolean;
  /** The exam year (2028), which names the department staff set: NNE28. */
  examYear?: number | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

export interface ClassAccountGraphPort {
  findUserByUpn(upn: string): Promise<GraphResult<{ id: string } | null>>;
  createUser(input: CreateEntraUserInput): Promise<GraphResult<{ id: string }>>;
  assignLicense(userId: string, skuId: string): Promise<GraphResult<void>>;
  addToGroup(groupId: string, userId: string): Promise<GraphResult<void>>;
  setOtherMails(userId: string, emails: string[]): Promise<GraphResult<void>>;
  readUpn(userId: string): Promise<GraphResult<string>>;
}

export interface ClassAccountStorePort {
  getStudent(userId: string): Promise<ClassAccountStudent | null>;
  getSetup(userId: string): Promise<ClassAccountSetup | null>;
  saveSetup(setup: ClassAccountSetup): Promise<void>;
  readDefaults(): Promise<StudentAccountDefaults>;
  /** users.ms_oid + linked_classroom_email, student_profiles.ms_teams_email. Never users.email. */
  linkMicrosoft(userId: string, msOid: string, upn: string): Promise<void>;
  /** The student's year classroom, enrolled (idempotent), Nexus onboarding approved. */
  enrolInClassroom(userId: string): Promise<{ classroomId: string; classroomName: string }>;
  syncTeams(input: { userId: string; classroomId: string; upn: string }): Promise<
    { status: 'done' } | { status: 'skipped' | 'failed'; reason: string }
  >;
  sendWelcome(input: { student: ClassAccountStudent; upn: string }): Promise<
    { status: 'done'; to: string } | { status: 'skipped' | 'failed'; reason: string }
  >;
  audit(userId: string, field: string, value: unknown, actorId: string): Promise<void>;
}

export interface ClassAccountPorts {
  graph: ClassAccountGraphPort;
  store: ClassAccountStorePort;
  randomPassword: () => string;
  now?: () => Date;
}

export type ProvisionResult =
  | { kind: 'invalid'; status: 400; error: string }
  | { kind: 'conflict'; status: 404 | 409; code: 'record_missing' | 'not_a_student' | 'upn_taken'; error: string }
  | { kind: 'graph_failed'; status: number; error: GraphErrorInfo; setup: ClassAccountSetup | null }
  | {
      kind: 'ok';
      setup: ClassAccountSetup;
      /** Only when Microsoft refused the start password and a random one was made just now. Show once. */
      password: string | null;
      /** True when every step is done or deliberately skipped. */
      complete: boolean;
    };

export const NO_STUDENT = 'That student record no longer exists. Refresh and try again.';
export const NOT_A_STUDENT_RECORD = 'Class accounts are only made for enrolled students.';
export const ID_TAKEN = 'That login ID belongs to another Microsoft account. Choose another.';
export const NO_LICENSE_SET =
  'No student license is set up yet, so the account has none. Create one account in Nexus > Students first, which saves the license.';
export const LINK_FAILED = 'The Microsoft account exists, but it could not be saved on the student record. Retry.';
export const CLASSROOM_FAILED_MESSAGE = 'Could not add them to their year classroom. Retry, or add them in Nexus.';
export const TEAMS_LATER =
  'Not in the class Team yet. A brand new account can take a few minutes to reach Microsoft Teams. Retry in 5 minutes.';
export const WELCOME_FAILED = 'The welcome email did not send. Resend it, or copy the WhatsApp message.';
export const ALREADY_IN_USE = 'Not sent: they already use this account.';

export function emptySteps(): ClassSteps {
  return {
    account: { status: 'pending' },
    licence: { status: 'pending' },
    link: { status: 'pending' },
    classroom: { status: 'pending' },
    teams: { status: 'pending' },
    welcome: { status: 'pending' },
  };
}

export function isSetupComplete(steps: ClassSteps): boolean {
  return CLASS_STEP_KEYS.every((key) => steps[key].status === 'done' || steps[key].status === 'skipped');
}

/** The login ID Admin suggests before an account exists. */
export function suggestClassUsername(student: Pick<ClassAccountStudent, 'firstName' | 'fatherName' | 'lastName'>): string {
  return suggestUsernameFromFather(student.firstName, student.fatherName, student.lastName);
}

function describe(error: GraphErrorInfo): string {
  return error.fix ? `${error.message} ${error.fix}` : error.message;
}

/** Microsoft said no to the password itself (too common, contains the name, too short). */
function isPasswordRefused(error: GraphErrorInfo): boolean {
  return /password/i.test(error.raw || '') && /(complexity|policy|banned|weak|invalid)/i.test(error.raw || '');
}

export async function provisionClassAccount(
  ports: ClassAccountPorts,
  input: {
    userId: string;
    /** The ID staff confirmed. Ignored once the account exists. */
    username?: string | null;
    actorId: string;
    /** Send the welcome email again even if it went before. */
    resendWelcome?: boolean;
    /** False when the student already uses the account (adopting it): no welcome email. */
    welcome?: boolean;
  },
): Promise<ProvisionResult> {
  const { graph, store } = ports;
  const now = () => (ports.now ? ports.now() : new Date()).toISOString();

  const student = await store.getStudent(input.userId);
  if (!student) return { kind: 'conflict', status: 404, code: 'record_missing', error: NO_STUDENT };
  if (student.isStaff || !student.isStudent) {
    return { kind: 'conflict', status: 409, code: 'not_a_student', error: NOT_A_STUDENT_RECORD };
  }

  const defaults = await store.readDefaults();
  const existing = await store.getSetup(student.id);
  let setup: ClassAccountSetup;

  if (existing && existing.steps.account.status === 'done') {
    setup = { ...existing, steps: { ...emptySteps(), ...existing.steps } };
  } else {
    const username = normalizeUsername(input.username || '') || suggestClassUsername(student);
    if (!isValidUsername(username)) {
      return {
        kind: 'invalid',
        status: 400,
        error: 'The login ID can use letters, numbers, dots, dashes and underscores, and must start and end with a letter or number.',
      };
    }
    setup = {
      userId: student.id,
      upn: upnFor(username, defaults.domain),
      msOid: existing?.msOid ?? null,
      passwordMode: existing?.passwordMode ?? 'start',
      accountCreatedAt: existing?.accountCreatedAt ?? null,
      steps: { ...emptySteps(), ...(existing?.steps || {}) },
      createdBy: existing?.createdBy ?? input.actorId,
    };
  }

  const mark = async (key: ClassStepKey, step: Omit<ClassStep, 'at'>) => {
    setup.steps[key] = { ...step, at: now() };
    await store.saveSetup(setup);
  };

  let shownPassword: string | null = null;

  // 1. The Microsoft account: one already on the record, one an earlier run made, or a new one.
  if (setup.steps.account.status !== 'done') {
    if (student.msOid) {
      const upn = await graph.readUpn(student.msOid);
      setup.msOid = student.msOid;
      if (upn.ok && upn.value) setup.upn = upn.value;
      await mark('account', { status: 'done', message: 'Already had a Microsoft account; kept it.' });
    } else {
      const found = await graph.findUserByUpn(setup.upn);
      if (!found.ok) {
        await mark('account', { status: 'failed', message: describe(found.error) });
        return { kind: 'graph_failed', status: found.status || 502, error: found.error, setup };
      }
      if (found.value) {
        // Ours from a run that stopped before it was saved, or someone else's.
        if (setup.msOid && found.value.id === setup.msOid) {
          await mark('account', { status: 'done' });
        } else {
          return { kind: 'conflict', status: 409, code: 'upn_taken', error: ID_TAKEN };
        }
      } else {
        const base = {
          displayName: [student.firstName, student.lastName].filter(Boolean).join(' '),
          givenName: student.firstName,
          surname: student.lastName || null,
          upn: setup.upn,
          mailNickname: setup.upn.split('@')[0],
          mobilePhone: student.phone ? `+91 ${student.phone}` : null,
          usageLocation: defaults.usage_location,
          // As staff filled it by hand: Student, NNE28, and the city they live in.
          jobTitle: STUDENT_JOB_TITLE,
          department: studentDepartment(student.examYear),
          city: student.city || null,
          state: student.state || null,
          country: student.country || null,
        };
        const start = startPassword(student.firstName);
        let created = start ? await graph.createUser({ ...base, password: start }) : null;
        let mode: 'start' | 'random' = 'start';
        if (!created || (!created.ok && isPasswordRefused(created.error))) {
          const random = ports.randomPassword();
          created = await graph.createUser({ ...base, password: random });
          mode = 'random';
          if (created.ok) shownPassword = random;
        }
        if (!created.ok) {
          if (/already exists/i.test(created.error.raw || '')) {
            return { kind: 'conflict', status: 409, code: 'upn_taken', error: ID_TAKEN };
          }
          await mark('account', { status: 'failed', message: describe(created.error) });
          return { kind: 'graph_failed', status: created.status || 502, error: created.error, setup };
        }
        setup.msOid = created.value.id;
        setup.passwordMode = mode;
        setup.accountCreatedAt = now();
        await mark('account', { status: 'done' });
      }
    }
  }

  const msOid = setup.msOid as string;

  // 2. The license. A failure keeps the account; Retry tries again.
  if (setup.steps.licence.status !== 'done') {
    if (!defaults.sku_id) {
      await mark('licence', { status: 'failed', message: NO_LICENSE_SET });
    } else {
      const licensed =
        defaults.license_mode === 'group' && defaults.license_group_id
          ? await graph.addToGroup(defaults.license_group_id, msOid)
          : await graph.assignLicense(msOid, defaults.sku_id);
      await mark('licence', licensed.ok ? { status: 'done' } : { status: 'failed', message: describe(licensed.error) });
    }
  }

  // 3. Their Neram record. The personal email on the account helps every later match.
  if (setup.steps.link.status !== 'done') {
    if (student.personalEmail) await graph.setOtherMails(msOid, [student.personalEmail]);
    try {
      await store.linkMicrosoft(student.id, msOid, setup.upn);
      await mark('link', { status: 'done' });
    } catch {
      await mark('link', { status: 'failed', message: LINK_FAILED });
    }
  }

  // 4 and 5. The year classroom, then its Team (needs the link, so Nexus knows them).
  let classroom: { classroomId: string; classroomName: string } | null = null;
  if (setup.steps.link.status === 'done' && (setup.steps.classroom.status !== 'done' || setup.steps.teams.status !== 'done')) {
    try {
      classroom = await store.enrolInClassroom(student.id);
      if (setup.steps.classroom.status !== 'done') {
        await mark('classroom', { status: 'done', message: classroom.classroomName });
      }
    } catch (err) {
      await mark('classroom', {
        status: 'failed',
        message: err instanceof Error && err.message ? `${CLASSROOM_FAILED_MESSAGE} (${err.message})` : CLASSROOM_FAILED_MESSAGE,
      });
    }
  }
  if (classroom && setup.steps.teams.status !== 'done') {
    try {
      const teams = await store.syncTeams({ userId: student.id, classroomId: classroom.classroomId, upn: setup.upn });
      await mark('teams', teams.status === 'done' ? { status: 'done' } : { status: teams.status, message: teams.reason });
    } catch {
      await mark('teams', { status: 'failed', message: TEAMS_LATER });
    }
  }

  // 6. The welcome email: login ID and the setup link, no password.
  if (input.welcome === false && setup.steps.welcome.status === 'pending' && !input.resendWelcome) {
    await mark('welcome', { status: 'skipped', message: ALREADY_IN_USE });
  } else if (setup.steps.link.status === 'done' && (setup.steps.welcome.status !== 'done' || input.resendWelcome)) {
    try {
      const sent = await store.sendWelcome({ student, upn: setup.upn });
      await mark(
        'welcome',
        sent.status === 'done' ? { status: 'done', message: sent.to } : { status: sent.status, message: sent.reason },
      );
    } catch {
      await mark('welcome', { status: 'failed', message: WELCOME_FAILED });
    }
  }

  // The audit names the account. Never the password.
  try {
    await store.audit(student.id, 'class_account', { upn: setup.upn, steps: setup.steps }, input.actorId);
  } catch {
    // An audit failure must not hide an account staff are about to hand over.
  }

  return { kind: 'ok', setup, password: shownPassword, complete: isSetupComplete(setup.steps) };
}
