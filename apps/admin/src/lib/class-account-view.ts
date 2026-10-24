/**
 * What the Class account card shows: the saved steps, the suggested login ID
 * before there is an account, the WhatsApp message to copy, and how far the
 * student is in the setup guide. Never a password.
 */
import {
  buildClassAccountMessage,
  isSetupComplete,
  readEntraProfile,
  readStudentAccountDefaults,
  startPassword,
  studentDepartment,
  suggestClassUsername,
  teamsProfileFix,
  upnFor,
  whatsAppShareUrl,
  type ClassSteps,
  type EntraProfile,
  type TeamsProfileFix,
} from '@neram/auth/student-accounts';
import { getWhatsAppGroupLinkForUser, guideProgress } from '@neram/database/class-account';
import { readClassAccountSetup, readClassAccountStudent } from './class-account-store';

export interface ClassAccountView {
  student: { id: string; firstName: string; phone: string | null; personalEmail: string | null; hasFather: boolean; isStudent: boolean };
  /** Before an account exists: the ID staff confirm, and the start password that goes with it. */
  suggestion: { username: string; domain: string; upn: string; startPassword: string | null };
  setup: null | {
    upn: string;
    passwordMode: 'start' | 'random';
    steps: ClassSteps;
    complete: boolean;
    /** When this card made the Microsoft account. Null when an existing one was kept. */
    accountCreatedAt: string | null;
    createdAt: string;
    updatedAt: string;
    passwordChangedAt: string | null;
    passwordResetAt: string | null;
  };
  whatsapp: { message: string; url: string } | null;
  guide: { count: number; total: number } | null;
  batchGroup: { url: string; source: string; batchLabel: string | null } | null;
  /**
   * A Microsoft account already on the record with no setup here (made in Nexus or
   * by hand). Setting up again would make a second login, so the card adopts it.
   */
  existing: { upn: string | null } | null;
  /**
   * Where the Microsoft account came from: none yet, made by hand (Nexus or the
   * Microsoft portal, before class accounts were automatic), made by hand and then
   * checked here (adopted), or made by this card or the automatic job.
   */
  origin: 'none' | 'hand' | 'adopted' | 'made';
  /** The name Teams should show: first and last name. */
  teamsName: { givenName: string; surname: string | null; displayName: string };
  /** What Teams shows today (name, job title, department), read from Microsoft. Null when unreadable. */
  teams: EntraProfile | null;
  /** The department the exam year gives (NNE28), or null when the exam year is unknown. */
  department: string | null;
  /** What to change so Teams matches how staff set students up. Null when it already does. */
  teamsFix: TeamsProfileFix | null;
  /** When the student first used the account: opened Nexus or chose their own password. */
  signedInAt: string | null;
  /** The student group chat in Teams, for staff to add someone by hand. */
  groupChatUrl: string | null;
}

const OWN_DOMAIN = /@(neramclasses\.com|neramclasses\.onmicrosoft\.com)$/i;

export async function buildClassAccountView(supabase: any, userId: string): Promise<ClassAccountView | null> {
  const student = await readClassAccountStudent(supabase, userId);
  if (!student) return null;
  const [{ defaults }, setup, batchGroup, signals, chat, entra] = await Promise.all([
    readStudentAccountDefaults(supabase),
    readClassAccountSetup(supabase, userId),
    getWhatsAppGroupLinkForUser(supabase, userId).catch(() => null),
    supabase.from('users').select('nexus_first_login_at, photo_status, linked_classroom_email, email').eq('id', userId).maybeSingle(),
    supabase.from('app_settings').select('setting_value').eq('setting_key', 'teams_group_chat').maybeSingle(),
    student.msOid ? readEntraProfile(student.msOid).catch(() => null) : Promise.resolve(null),
  ]);
  const user = signals?.data;
  const accountDone = setup?.steps.account.status === 'done';
  const signedIn = [user?.nexus_first_login_at, setup?.row.password_changed_at].filter(Boolean) as string[];

  const username = suggestClassUsername(student);
  const origin: ClassAccountView['origin'] = accountDone
    ? setup!.accountCreatedAt
      ? 'made'
      : 'adopted'
    : student.msOid
      ? 'hand'
      : 'none';
  const displayName = [student.firstName, student.lastName].filter(Boolean).join(' ');
  const teams = entra && entra.ok ? entra.value : null;
  const view: ClassAccountView = {
    student: {
      id: student.id,
      firstName: student.firstName,
      phone: student.phone,
      personalEmail: student.personalEmail,
      hasFather: !!student.fatherName,
      isStudent: student.isStudent && !student.isStaff,
    },
    suggestion: { username, domain: defaults.domain, upn: upnFor(username, defaults.domain), startPassword: startPassword(student.firstName) },
    setup: null,
    whatsapp: null,
    guide: null,
    batchGroup,
    existing:
      student.msOid && !accountDone
        ? { upn: user?.linked_classroom_email || (OWN_DOMAIN.test(String(user?.email || '')) ? user.email : null) }
        : null,
    origin,
    teamsName: { givenName: student.firstName, surname: student.lastName, displayName },
    teams,
    department: studentDepartment(student.examYear),
    teamsFix: teams
      ? teamsProfileFix({ current: teams, expectedName: displayName, nameIsOurs: origin === 'made', examYear: student.examYear })
      : null,
    signedInAt: student.msOid && signedIn.length ? signedIn.sort()[0] : null,
    groupChatUrl: chat?.data?.setting_value?.invite_link || null,
  };

  if (setup) {
    view.setup = {
      upn: setup.upn,
      passwordMode: setup.passwordMode,
      steps: setup.steps,
      complete: isSetupComplete(setup.steps),
      accountCreatedAt: setup.accountCreatedAt,
      createdAt: setup.row.created_at,
      updatedAt: setup.row.updated_at,
      passwordChangedAt: setup.row.password_changed_at ?? null,
      passwordResetAt: setup.row.password_reset_at ?? null,
    };
    if (setup.steps.account.status === 'done') {
      const message = buildClassAccountMessage({ firstName: student.firstName, upn: setup.upn });
      view.whatsapp = { message, url: whatsAppShareUrl(message, student.phone) };
      const progress = guideProgress({
        ticks: setup.row.student_ticks,
        passwordChangedAt: setup.row.password_changed_at,
        nexusFirstLoginAt: user?.nexus_first_login_at,
        photoStatus: user?.photo_status,
      });
      view.guide = { count: progress.count, total: progress.total };
    }
  }
  return view;
}
