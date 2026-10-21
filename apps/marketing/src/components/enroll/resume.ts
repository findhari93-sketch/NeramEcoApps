/**
 * Resume an enrolment from wherever the student left it.
 *
 * Three copies can exist: this browser's local progress (every keystroke,
 * 7 days), the server draft (checkpoints on the link, any device) and the
 * saved application ("pay later" or an Instant UPI start). The newest wins;
 * the saved application sits underneath a draft so blanks are filled.
 */
import type { ApplicationFormData, PersonalInfoData, LocationData, AcademicDetailsData, PaymentDetailsData } from '@/components/apply/types';
import type { EnrollmentProgress } from '@/hooks/useEnrollmentProgress';

export interface ServerResume {
  saved: { form: Record<string, unknown>; scheme: 'full' | 'installment' | null; savedAt: string } | null;
  draft: { form: Record<string, Record<string, unknown>>; step: number; savedAt: string } | null;
}

export type ResumeSource = 'local' | 'draft' | 'saved';

export interface ResumePlan {
  source: ResumeSource;
  step: number;
  formData: ApplicationFormData;
  termsAccepted: boolean;
  savedAt: string;
}

const LAST_STEP = 3;
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : typeof v === 'number' ? String(v) : null);
const keep = <T,>(saved: string | null, prev: T): T | string => (saved === null ? prev : saved);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const ACADEMIC_SLOT: Record<string, keyof AcademicDetailsData> = {
  school_student: 'schoolStudentData',
  diploma_student: 'diplomaStudentData',
  college_student: 'collegeStudentData',
  working_professional: 'workingProfessionalData',
};

/** The saved application (the shape /api/enroll/complete takes) back into the wizard's fields. */
export function applySavedForm(prev: ApplicationFormData, saved: Record<string, unknown>, scheme: 'full' | 'installment' | null): ApplicationFormData {
  const personal: PersonalInfoData = {
    ...prev.personal,
    firstName: keep(text(saved.firstName), prev.personal.firstName),
    fatherName: keep(text(saved.fatherName), prev.personal.fatherName),
    dateOfBirth: keep(text(saved.dateOfBirth), prev.personal.dateOfBirth),
    gender: keep(text(saved.gender), prev.personal.gender) as PersonalInfoData['gender'],
    parentPhone: keep(text(saved.parentPhone), prev.personal.parentPhone),
    phone: prev.personal.phone || text(saved.studentPhone) || '',
  };
  const location: LocationData = {
    ...prev.location,
    country: keep(text(saved.country), prev.location.country),
    state: keep(text(saved.state), prev.location.state),
    city: keep(text(saved.city), prev.location.city),
    district: keep(text(saved.district), prev.location.district),
    pincode: keep(text(saved.pincode), prev.location.pincode),
    address: keep(text(saved.address), prev.location.address),
  };
  const category = text(saved.applicantCategory);
  const academic: AcademicDetailsData = {
    ...prev.academic,
    applicantCategory: (category || prev.academic.applicantCategory) as AcademicDetailsData['applicantCategory'],
    casteCategory: (text(saved.casteCategory) || prev.academic.casteCategory) as AcademicDetailsData['casteCategory'],
    targetExamYear: text(saved.targetExamYear) || prev.academic.targetExamYear,
    schoolType: (text(saved.schoolType) || prev.academic.schoolType) as AcademicDetailsData['schoolType'],
  };
  const slot = category ? ACADEMIC_SLOT[category] : undefined;
  if (slot && isObject(saved.academicData)) {
    (academic as unknown as Record<string, unknown>)[slot] = saved.academicData;
  }
  const payment: PaymentDetailsData = { ...prev.payment, paymentType: scheme || prev.payment.paymentType };
  return { ...prev, personal, location, academic, payment };
}

/** A draft or local copy: whole wizard sections, laid over what is there. */
function mergeSections(prev: ApplicationFormData, sections: Record<string, unknown>): ApplicationFormData {
  const next = { ...prev };
  for (const key of ['personal', 'location', 'academic', 'payment'] as const) {
    const value = sections[key];
    if (isObject(value)) (next as Record<string, unknown>)[key] = { ...prev[key], ...value };
  }
  return next;
}

const clampStep = (step: unknown): number => (typeof step === 'number' && Number.isFinite(step) ? Math.min(LAST_STEP, Math.max(0, Math.floor(step))) : 0);
const time = (iso: string | null | undefined): number => (iso ? new Date(iso).getTime() || 0 : 0);

/**
 * Which copy to restore and what the wizard should show. Null when there is
 * nothing to resume. On a tie this browser's copy wins (it also knows the
 * terms tick).
 */
export function planResume(args: { local: EnrollmentProgress | null; server: ServerResume | null; base: ApplicationFormData }): ResumePlan | null {
  const { local, base } = args;
  const saved = args.server?.saved || null;
  const draft = args.server?.draft || null;
  const candidates: { source: ResumeSource; at: number }[] = [];
  if (local) candidates.push({ source: 'local', at: time(local.savedAt) });
  if (draft) candidates.push({ source: 'draft', at: time(draft.savedAt) });
  if (saved) candidates.push({ source: 'saved', at: time(saved.savedAt) });
  if (!candidates.length) return null;
  const order: Record<ResumeSource, number> = { local: 0, draft: 1, saved: 2 };
  candidates.sort((a, b) => b.at - a.at || order[a.source] - order[b.source]);
  const winner = candidates[0].source;

  let formData = saved ? applySavedForm(base, saved.form, saved.scheme) : base;
  if (winner === 'saved') {
    return { source: 'saved', step: saved!.scheme ? LAST_STEP : 2, formData, termsAccepted: false, savedAt: saved!.savedAt };
  }
  if (winner === 'draft') {
    formData = mergeSections(formData, draft!.form);
    return { source: 'draft', step: clampStep(draft!.step), formData, termsAccepted: false, savedAt: draft!.savedAt };
  }
  formData = mergeSections(formData, local!.formData);
  return { source: 'local', step: clampStep(local!.currentStep), formData, termsAccepted: local!.termsAccepted === true, savedAt: local!.savedAt };
}

/** "Welcome back. We kept what you entered on 20 Oct, 10:50 pm. You are on step 4 of 4: Pay." */
export function resumeMessage(plan: Pick<ResumePlan, 'step' | 'savedAt'>, stepLabels: string[]): string {
  const when = new Date(plan.savedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  const label = stepLabels[plan.step] || '';
  return `Welcome back. We kept what you entered on ${when}. You are on step ${plan.step + 1} of ${stepLabels.length}: ${label}.`;
}
