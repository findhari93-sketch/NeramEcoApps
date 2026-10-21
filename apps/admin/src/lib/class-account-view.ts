/**
 * What the Class account card shows: the saved steps, the suggested login ID
 * before there is an account, the WhatsApp message to copy, and how far the
 * student is in the setup guide. Never a password.
 */
import {
  buildClassAccountMessage,
  isSetupComplete,
  readStudentAccountDefaults,
  startPassword,
  suggestClassUsername,
  upnFor,
  whatsAppShareUrl,
  type ClassSteps,
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
    createdAt: string;
    updatedAt: string;
    passwordChangedAt: string | null;
    passwordResetAt: string | null;
  };
  whatsapp: { message: string; url: string } | null;
  guide: { count: number; total: number } | null;
  batchGroup: { url: string; source: string; batchLabel: string | null } | null;
}

export async function buildClassAccountView(supabase: any, userId: string): Promise<ClassAccountView | null> {
  const student = await readClassAccountStudent(supabase, userId);
  if (!student) return null;
  const [{ defaults }, setup, batchGroup, signals] = await Promise.all([
    readStudentAccountDefaults(supabase),
    readClassAccountSetup(supabase, userId),
    getWhatsAppGroupLinkForUser(supabase, userId).catch(() => null),
    supabase.from('users').select('nexus_first_login_at, photo_status').eq('id', userId).maybeSingle(),
  ]);

  const username = suggestClassUsername(student);
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
  };

  if (setup) {
    view.setup = {
      upn: setup.upn,
      passwordMode: setup.passwordMode,
      steps: setup.steps,
      complete: isSetupComplete(setup.steps),
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
        nexusFirstLoginAt: signals?.data?.nexus_first_login_at,
        photoStatus: signals?.data?.photo_status,
      });
      view.guide = { count: progress.count, total: progress.total };
    }
  }
  return view;
}
