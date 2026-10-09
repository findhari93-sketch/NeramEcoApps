'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { ApplicationFormData, FormStep, StepValidation } from './types';
import { ensureAccount } from '@/lib/ensure-account';
import { DEFAULT_FORM_DATA, STEP_COUNT } from './types';
import { useFirebaseAuth } from '@neram/auth';
import { fromStoredPhone, isListedCountry, residenceFromStored, toStoredPhone } from './countryConfig';
import { isSamePhone } from '@/lib/phone';
import { captureAttributionFromUrl } from '@/lib/attribution';
import { trackTaxonomyEvent } from '@/lib/funnel-tracker';
import {
  validateStep as validateStepData,
  buildDraftPayload,
  buildSubmitPayload,
  remapSavedStep,
  submitRequest,
  SAVED_STATE_VERSION,
} from './validation';

// ============================================
// LOCAL STORAGE PERSISTENCE
// ============================================

const STORAGE_KEY = 'neram_application_draft';
const STARTED_KEY = 'neram_application_started';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';

/** Onboarding education stages to applicant_category values. */
const ONBOARDING_CATEGORY_MAP: Record<string, string> = {
  '8th': 'school_student',
  '9th': 'school_student',
  '10th': 'school_student',
  '11th': 'school_student',
  '12th': 'school_student',
  college: 'college_student',
  working: 'working_professional',
  school_student: 'school_student',
  diploma_student: 'diploma_student',
  college_student: 'college_student',
  working_professional: 'working_professional',
};

export interface SubmittedApplication {
  id: string;
  applicationNumber: string | null;
}

interface SavedFormState {
  version?: number;
  formData: ApplicationFormData;
  activeStep: FormStep;
  savedAt: string;
  submittedApplication?: SubmittedApplication | null;
  /** The Firebase uid that saved this draft, so another account on a shared device never inherits it. */
  ownerUid?: string | null;
}

function saveToStorage(
  formData: ApplicationFormData,
  activeStep: FormStep,
  submittedApplication: SubmittedApplication | null,
  ownerUid: string | null = null,
): void {
  try {
    const state: SavedFormState = {
      version: SAVED_STATE_VERSION,
      formData,
      activeStep,
      savedAt: new Date().toISOString(),
      submittedApplication,
      ownerUid,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage full or unavailable
  }
}

function loadFromStorage(): SavedFormState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state: SavedFormState = JSON.parse(raw);
    // Expire after 7 days
    if (state.savedAt) {
      const age = Date.now() - new Date(state.savedAt).getTime();
      if (age > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
    }
    return state;
  } catch {
    return null;
  }
}

function clearStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ============================================
// CONTEXT TYPE
// ============================================

export type ReturnUserMode = 'dashboard' | 'edit' | 'add-course' | 'new-form';

export type SubmitResult =
  | { ok: true; id: string; applicationNumber: string | null }
  | { ok: false; error: string };

interface FormContextType {
  // Form data
  formData: ApplicationFormData;
  setFormData: React.Dispatch<React.SetStateAction<ApplicationFormData>>;
  updateFormData: <K extends keyof ApplicationFormData>(
    section: K,
    data: Partial<ApplicationFormData[K]>
  ) => void;
  setTermsAccepted: (accepted: boolean) => void;

  // Step navigation
  activeStep: FormStep;
  setActiveStep: (step: FormStep) => void;
  goToNextStep: () => void;
  goToPreviousStep: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;

  // Validation
  validateStep: (step: FormStep) => StepValidation;
  stepValidations: Record<FormStep, StepValidation>;

  // Phone verification
  showPhoneVerification: boolean;
  setShowPhoneVerification: (show: boolean) => void;
  onPhoneVerified: (phone: string) => void;

  // Pre-filled tracking
  prefilledFields: Set<string>;
  isFieldPrefilled: (field: string) => boolean;

  // Submission
  isSubmitting: boolean;
  setIsSubmitting: (submitting: boolean) => void;
  submissionError: string | null;
  setSubmissionError: (error: string | null) => void;

  // Persistence
  clearSavedForm: () => void;
  /** Stop saving the form on this device and drop what is saved (after payment). */
  forgetDraft: () => void;

  // Draft save to DB
  saveDraftToDb: (stepCompleted: number) => Promise<boolean>;
  isSavingDraft: boolean;
  draftId: string | null;
  setDraftId: React.Dispatch<React.SetStateAction<string | null>>;

  // User auth state
  isAuthenticated: boolean;
  isAuthLoading: boolean;

  // Returning user
  existingApplications: any[];
  isReturningUser: boolean;
  returnUserMode: ReturnUserMode;
  setReturnUserMode: (mode: ReturnUserMode) => void;
  returningUserCheckComplete: boolean;
  prefillFromExistingApplication: (application: any) => void;

  // Application deletion
  removeApplication: (id: string) => Promise<boolean>;

  // Refresh applications (after payment, etc.)
  refreshApplications: () => Promise<void>;

  // Submission (Review step)
  submitApplication: () => Promise<SubmitResult>;
  submittedApplication: SubmittedApplication | null;

  // Analytics: fires application_started once per browser session
  markApplicationStarted: () => void;

  /** The signed-in account existed before this visit (it had data to bring back). */
  isReturningAccount: boolean;
  /** Re-read the account (after phone verification or an account switch). */
  refreshAccount: () => void;
}

const FormContext = createContext<FormContextType | null>(null);

// ============================================
// PROVIDER COMPONENT
// ============================================

interface FormProviderProps {
  children: React.ReactNode;
}

export function FormProvider({ children }: FormProviderProps) {
  const { user, loading: authLoading } = useFirebaseAuth();

  const [formData, setFormData] = useState<ApplicationFormData>(DEFAULT_FORM_DATA);
  const [activeStep, setActiveStepState] = useState<FormStep>(0);
  const [showPhoneVerification, setShowPhoneVerification] = useState(false);
  const [prefilledFields, setPrefilledFields] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [submittedApplication, setSubmittedApplication] = useState<SubmittedApplication | null>(null);
  const hasRestoredRef = useRef(false);
  const draftForgottenRef = useRef(false);

  // Returning user state
  const [existingApplications, setExistingApplications] = useState<any[]>([]);
  const [isReturningUser, setIsReturningUser] = useState(false);
  const [returnUserMode, setReturnUserMode] = useState<ReturnUserMode>('new-form');
  const [returningUserCheckComplete, setReturningUserCheckComplete] = useState(false);
  const [isReturningAccount, setIsReturningAccount] = useState(false);
  const [accountRefresh, setAccountRefresh] = useState(0);
  /** Who saved the draft on this device (null: typed before signing in). */
  const draftOwnerRef = useRef<string | null>(null);

  // Restore saved state from localStorage after mount (avoids hydration mismatch)
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;
    const saved = loadFromStorage();
    if (saved) {
      draftOwnerRef.current = saved.ownerUid ?? null;
      // Sanitize any stale onboarding values stored in localStorage
      const validCategories = ['school_student', 'diploma_student', 'college_student', 'working_professional'];
      const categoryMap: Record<string, string> = {
        '8th': 'school_student', '9th': 'school_student', '10th': 'school_student',
        '11th': 'school_student', '12th': 'school_student',
        'college': 'college_student', 'working': 'working_professional',
      };
      const cat = saved.formData.academic?.applicantCategory;
      if (cat && !validCategories.includes(cat)) {
        const mapped = categoryMap[cat];
        saved.formData.academic.applicantCategory = (mapped || null) as any;
      }

      // Older drafts have no feeStructureId etc.; merge over the defaults so
      // every key exists, then reopen on the remapped step.
      // Before phoneCountry existed, the one country also gave the mobile's code.
      const savedPersonal: Partial<ApplicationFormData['personal']> = saved.formData.personal || {};
      const savedLocation: Partial<ApplicationFormData['location']> = saved.formData.location || {};
      const legacyCountry = savedLocation.country && isListedCountry(savedLocation.country) ? savedLocation.country : 'IN';
      setFormData({
        ...DEFAULT_FORM_DATA,
        ...saved.formData,
        personal: { ...DEFAULT_FORM_DATA.personal, phoneCountry: legacyCountry, ...savedPersonal },
        location: { ...DEFAULT_FORM_DATA.location, ...savedLocation },
        academic: { ...DEFAULT_FORM_DATA.academic, ...saved.formData.academic },
        course: { ...DEFAULT_FORM_DATA.course, ...saved.formData.course },
      });
      // Never reopen on Pay from the device: the session may be gone or the
      // device shared. A signed-in applicant reaches Pay again from the
      // dashboard's Continue to payment.
      setActiveStepState(remapSavedStep(saved));
    }
  }, []);

  // Auto-save form data and step to localStorage on every change
  useEffect(() => {
    if (!hasRestoredRef.current) return; // Don't save until initial restore is done
    if (draftForgottenRef.current) return; // Paid: nothing left to resume on this device
    saveToStorage(formData, activeStep, null, draftOwnerRef.current);
  }, [formData, activeStep]);

  const forgetDraft = useCallback(() => {
    draftForgottenRef.current = true;
    clearStorage();
  }, []);

  const clearSavedForm = useCallback(() => {
    clearStorage();
    setFormData(DEFAULT_FORM_DATA);
    setActiveStepState(0);
    setDraftId(null);
    setSubmittedApplication(null);
  }, []);

  // Prefill form from an existing submitted application
  const prefillFromExistingApplication = useCallback((app: any) => {
    setFormData((prev) => ({
      ...prev,
      personal: {
        ...prev.personal,
        firstName: app.first_name || prev.personal.firstName || '',
        fatherName: app.father_name || prev.personal.fatherName || '',
        phoneVerified: app.phone_verified || prev.personal.phoneVerified || false,
        phoneVerifiedAt: app.phone_verified_at || prev.personal.phoneVerifiedAt || null,
      },
      location: {
        ...prev.location,
        ...(app.country ? residenceFromStored(app.country) : {}),
        pincode: app.pincode || prev.location.pincode || '',
        city: app.city || prev.location.city || '',
        state: app.state || prev.location.state || '',
        district: app.district || prev.location.district || '',
        address: app.address || prev.location.address || '',
        latitude: app.latitude ?? prev.location.latitude ?? null,
        longitude: app.longitude ?? prev.location.longitude ?? null,
        locationSource: app.location_source || prev.location.locationSource || null,
        detectedLocation: app.detected_location || prev.location.detectedLocation || null,
      },
      academic: {
        ...prev.academic,
        applicantCategory: app.applicant_category || prev.academic.applicantCategory || null,
        casteCategory: app.caste_category || prev.academic.casteCategory || null,
        targetExamYear: app.target_exam_year || prev.academic.targetExamYear || null,
        schoolType: app.school_type || prev.academic.schoolType || null,
        schoolStudentData: app.applicant_category === 'school_student'
          ? app.academic_data : prev.academic.schoolStudentData,
        diplomaStudentData: app.applicant_category === 'diploma_student'
          ? app.academic_data : prev.academic.diplomaStudentData,
        collegeStudentData: app.applicant_category === 'college_student'
          ? app.academic_data : prev.academic.collegeStudentData,
        workingProfessionalData: app.applicant_category === 'working_professional'
          ? app.academic_data : prev.academic.workingProfessionalData,
      },
      // For 'add-course' mode: leave course empty so user picks new course
      // For 'edit' mode: prefill course too
      course: {
        ...prev.course,
        interestCourse: app.interest_course || prev.course.interestCourse || null,
        selectedCourseId: app.selected_course_id || prev.course.selectedCourseId || null,
        selectedCenterId: app.selected_center_id || prev.course.selectedCenterId || null,
        hybridLearningAccepted: app.hybrid_learning_accepted || prev.course.hybridLearningAccepted || false,
        learningMode: app.learning_mode || prev.course.learningMode || 'hybrid',
      },
    }));
  }, []);

  // Save current form state as draft to database
  const saveDraftToDb = useCallback(async (stepCompleted: number): Promise<boolean> => {
    if (!user) return false;

    setIsSavingDraft(true);
    try {
      const idToken = await (user.raw as any)?.getIdToken?.();
      if (!idToken) {
        console.warn('No idToken available for draft save');
        return false;
      }

      const payload = buildDraftPayload(formData, stepCompleted);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

      const response = await fetch('/api/application', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const result = await response.json();

      if (result.success && result.data?.id) {
        setDraftId(result.data.id);
        return true;
      }
      console.warn('Draft save response:', result);
      return false;
    } catch (error) {
      console.error('Draft save failed:', error);
      return false;
    } finally {
      setIsSavingDraft(false);
    }
  }, [user, formData]);

  // When an account signs in: make sure its row exists (ensureAccount), then
  // fill the form from what the account already knows, then look for a draft
  // or a submitted application. Runs again after the phone is verified (that
  // can switch to an older account with its own applications). Rules:
  // - nothing typed is ever overwritten; "Pre-filled" marks only what was filled;
  // - phoneVerified always comes from the account, never from this device;
  // - a draft saved on this device by a different account is dropped first.
  const lastUidRef = useRef<string | null>(null);
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      if (lastUidRef.current) {
        // Signed out: nothing on this device may still claim a verified phone.
        lastUidRef.current = null;
        setFormData((prev) => ({ ...prev, personal: { ...prev.personal, phoneVerified: false, phoneVerifiedAt: null } }));
        setExistingApplications([]);
        setIsReturningUser(false);
        setIsReturningAccount(false);
        setReturnUserMode('new-form');
        setDraftId(null);
        setPrefilledFields(new Set());
      }
      setReturningUserCheckComplete(true);
      return;
    }

    const uid = user.id;
    const uidChanged = lastUidRef.current !== uid;
    lastUidRef.current = uid;
    if (uidChanged) setReturningUserCheckComplete(false);
    let cancelled = false;

    const run = async () => {
      // A draft another account left on this device is not this student's.
      if (uidChanged && draftOwnerRef.current && draftOwnerRef.current !== uid) {
        setFormData((prev) => ({
          ...DEFAULT_FORM_DATA,
          utmSource: prev.utmSource,
          utmMedium: prev.utmMedium,
          utmCampaign: prev.utmCampaign,
          referralCode: prev.referralCode,
          gclid: prev.gclid,
          wbraid: prev.wbraid,
        }));
        setActiveStepState(0);
        setDraftId(null);
      }
      draftOwnerRef.current = uid;

      const account = await ensureAccount({ force: accountRefresh > 0 });
      if (cancelled) return;

      const prefilled = new Set<string>();
      /** Fill one field only if it is empty; remember it was filled. */
      const fill = (field: string, update: (prev: ApplicationFormData) => ApplicationFormData | null) => {
        setFormData((prev) => {
          const next = update(prev);
          if (!next) return prev;
          prefilled.add(field);
          return next;
        });
      };
      // The account's phone and whether it is verified, applied to the form.
      if (account) {
        setFormData((prev) => {
          if (!prev.personal.phone && account.phone) {
            prefilled.add('phone');
            return {
              ...prev,
              personal: {
                ...prev.personal,
                ...fromStoredPhone(account.phone, prev.personal.phoneCountry),
                phoneVerified: account.phone_verified === true,
                phoneVerifiedAt: account.phone_verified ? prev.personal.phoneVerifiedAt || new Date().toISOString() : null,
              },
            };
          }
          const verified =
            account.phone_verified === true &&
            !!prev.personal.phone &&
            isSamePhone(toStoredPhone(prev.personal.phone, prev.personal.phoneCountry), account.phone);
          if (verified === prev.personal.phoneVerified) return prev;
          return {
            ...prev,
            personal: { ...prev.personal, phoneVerified: verified, phoneVerifiedAt: verified ? new Date().toISOString() : null },
          };
        });
      }

      let idToken: string | undefined;
      try {
        idToken = await (user.raw as any)?.getIdToken?.();
      } catch {
        idToken = undefined;
      }
      if (cancelled) return;

      let accountHadData = false;
      if (idToken) {
        try {
          const response = await fetch(`${APP_URL}/api/profile`, { headers: { Authorization: `Bearer ${idToken}` } });
          if (response.ok && !cancelled) {
            const { user: profile } = await response.json();
            const fullName =
              profile.first_name && profile.last_name
                ? `${profile.first_name} ${profile.last_name}`
                : profile.first_name || (profile.name && profile.name !== 'User' ? profile.name : '');
            if (fullName) fill('firstName', (prev) => (prev.personal.firstName ? null : { ...prev, personal: { ...prev.personal, firstName: fullName } }));
            if (profile.email) fill('email', (prev) => (prev.personal.email ? null : { ...prev, personal: { ...prev.personal, email: profile.email } }));
            if (profile.date_of_birth) {
              accountHadData = true;
              fill('dateOfBirth', (prev) => (prev.personal.dateOfBirth ? null : { ...prev, personal: { ...prev.personal, dateOfBirth: profile.date_of_birth } }));
            }
            if (profile.gender === 'male' || profile.gender === 'female' || profile.gender === 'other') {
              fill('gender', (prev) => (prev.personal.gender ? null : { ...prev, personal: { ...prev.personal, gender: profile.gender } }));
            }
          }
        } catch (error) {
          console.error('Error pre-filling form:', error);
        }
      }
      if (cancelled) return;

      // Onboarding answers, only where the form has nothing yet.
      if (idToken) {
        try {
          const prefillRes = await fetch('/api/onboarding/prefill', { headers: { Authorization: `Bearer ${idToken}` } });
          if (prefillRes.ok && !cancelled) {
            const { prefill } = await prefillRes.json();
            if (prefill?.interest_course) {
              const courseValue = Array.isArray(prefill.interest_course) ? prefill.interest_course[0] : prefill.interest_course;
              fill('interestCourse', (prev) => (prev.course.interestCourse ? null : { ...prev, course: { ...prev.course, interestCourse: courseValue } }));
            }
            const mappedCategory = prefill?.applicant_category ? ONBOARDING_CATEGORY_MAP[prefill.applicant_category] : undefined;
            if (mappedCategory) {
              // Never second-guess an "I'm currently in" answer already given.
              fill('applicantCategory', (prev) =>
                prev.academic.applicantCategory || prev.academic.currentlyIn
                  ? null
                  : { ...prev, academic: { ...prev.academic, applicantCategory: mappedCategory as any } },
              );
            }
            if (prefill?.caste_category) {
              fill('casteCategory', (prev) => (prev.academic.casteCategory ? null : { ...prev, academic: { ...prev.academic, casteCategory: prefill.caste_category } }));
            }
          }
        } catch (error) {
          // Non-critical: onboarding pre-fill is optional
          console.error('Error pre-filling from onboarding:', error);
        }
      }
      if (cancelled) return;

      // Google's own name and email, when the account had none.
      if (user.name) {
        const googleName = user.name.trim();
        fill('firstName', (prev) => (prev.personal.firstName ? null : { ...prev, personal: { ...prev.personal, firstName: googleName } }));
      }
      if (user.email) {
        fill('email', (prev) => (prev.personal.email ? null : { ...prev, personal: { ...prev.personal, email: user.email! } }));
      }

      // Restore draft or detect returning user from database
      if (idToken) {
        try {
          const draftRes = await fetch('/api/application', { headers: { Authorization: `Bearer ${idToken}` } });
          if (draftRes.ok && !cancelled) {
            const { data: applications } = await draftRes.json();
            const allApps = applications || [];
            setExistingApplications(allApps);

            const draft = allApps.find((a: any) => a.status === 'draft');
            const submittedApps = allApps.filter((a: any) =>
              ['submitted', 'under_review', 'approved', 'rejected', 'pending_verification', 'enrolled', 'partial_payment'].includes(a.status)
            );
            if (allApps.length > 0) accountHadData = true;

            if (draft) {
              setDraftId(draft.id);
              // Restore lead_profile fields into the form (only empty fields)
              setFormData((prev) => ({
                ...prev,
                personal: {
                  ...prev.personal,
                  firstName: prev.personal.firstName || draft.first_name || '',
                  fatherName: prev.personal.fatherName || draft.father_name || '',
                  email: prev.personal.email || draft.email || '',
                  parentPhone: prev.personal.parentPhone || draft.parent_phone || '',
                  dateOfBirth: prev.personal.dateOfBirth || draft.date_of_birth || '',
                  gender: prev.personal.gender || draft.gender || '',
                },
                location: {
                  ...prev.location,
                  // The saved country only while the student has not started on the place here.
                  ...(draft.country && !prev.location.pincode && !prev.location.city ? residenceFromStored(draft.country) : {}),
                  pincode: prev.location.pincode || draft.pincode || '',
                  city: prev.location.city || draft.city || '',
                  state: prev.location.state || draft.state || '',
                  district: prev.location.district || draft.district || '',
                  address: prev.location.address || draft.address || '',
                  latitude: prev.location.latitude ?? draft.latitude ?? null,
                  longitude: prev.location.longitude ?? draft.longitude ?? null,
                  locationSource: prev.location.locationSource || draft.location_source || null,
                  detectedLocation: prev.location.detectedLocation || draft.detected_location || null,
                },
                academic: {
                  ...prev.academic,
                  applicantCategory: prev.academic.applicantCategory || draft.applicant_category || null,
                  casteCategory: prev.academic.casteCategory || draft.caste_category || null,
                  targetExamYear: prev.academic.targetExamYear || draft.target_exam_year || null,
                  schoolType: prev.academic.schoolType || draft.school_type || null,
                  schoolStudentData: prev.academic.schoolStudentData || (draft.applicant_category === 'school_student' ? draft.academic_data : null),
                  diplomaStudentData: prev.academic.diplomaStudentData || (draft.applicant_category === 'diploma_student' ? draft.academic_data : null),
                  collegeStudentData: prev.academic.collegeStudentData || (draft.applicant_category === 'college_student' ? draft.academic_data : null),
                  workingProfessionalData: prev.academic.workingProfessionalData || (draft.applicant_category === 'working_professional' ? draft.academic_data : null),
                },
                course: {
                  ...prev.course,
                  interestCourse: prev.course.interestCourse || draft.interest_course || null,
                  selectedCourseId: prev.course.selectedCourseId || draft.selected_course_id || null,
                  selectedCenterId: prev.course.selectedCenterId || draft.selected_center_id || null,
                  hybridLearningAccepted: prev.course.hybridLearningAccepted || draft.hybrid_learning_accepted || false,
                  feeStructureId: prev.course.feeStructureId || draft.fee_structure_id || null,
                },
              }));

              // form_step_completed is 1-indexed and counts the OLD steps for
              // drafts saved before this release; remap the same way localStorage is.
              const dbStep = remapSavedStep({ activeStep: (draft.form_step_completed || 1) - 1 });
              setActiveStepState((prev) => Math.max(prev, dbStep) as FormStep);
            } else if (submittedApps.length > 0) {
              // Returning user with submitted application(s)
              setIsReturningUser(true);
              setReturnUserMode('dashboard');
            }
          }
        } catch (error) {
          // Non-critical: draft restoration is optional
          console.error('Error restoring draft from DB:', error);
        }
      }
      if (cancelled) return;

      setIsReturningAccount(accountHadData || account?.isNewUser === false);
      setPrefilledFields(prefilled);
      setReturningUserCheckComplete(true);
    };

    run();
    return () => {
      cancelled = true;
    };
    // user.id, not user: a token refresh hands back a new object for the same person.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading, accountRefresh]);

  // Get UTM + Google Ads click IDs, center selection, and learning mode from URL.
  // captureAttributionFromUrl() also reads from sessionStorage so attribution
  // set on a previous page (e.g. /nata-coaching/chennai?gclid=…) survives
  // the hop to /apply where the form lives.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const attribution = captureAttributionFromUrl();

      const utmSource = attribution.utm_source || null;
      const utmMedium = attribution.utm_medium || null;
      const utmCampaign = attribution.utm_campaign || null;
      const referralCode = attribution.referral_code || params.get('ref') || null;
      const gclid = attribution.gclid || null;
      const wbraid = attribution.wbraid || null;

      if (utmSource || utmMedium || utmCampaign || referralCode || gclid || wbraid) {
        setFormData((prev) => ({
          ...prev,
          utmSource,
          utmMedium,
          utmCampaign,
          referralCode,
          gclid,
          wbraid,
        }));
      }

      // Read learning mode from URL (?mode=online)
      const mode = params.get('mode');
      if (mode === 'online') {
        setFormData((prev) => ({
          ...prev,
          course: {
            ...prev.course,
            learningMode: 'online_only',
            selectedCenterId: null,
            selectedCenterName: null,
            hybridLearningAccepted: false,
          },
        }));
      }

      // Read center slug from URL (?center=slug) and auto-select
      const centerSlug = params.get('center');
      if (centerSlug) {
        fetch(`/api/centers?slug=${encodeURIComponent(centerSlug)}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.success && data.data) {
              const center = data.data;
              setFormData((prev) => ({
                ...prev,
                course: {
                  ...prev.course,
                  selectedCenterId: center.id,
                  selectedCenterName: center.name,
                  hybridLearningAccepted: true,
                  learningMode: 'hybrid',
                },
              }));
            }
          })
          .catch(() => {
            // Ignore - invalid center slug
          });
      }
    }
  }, []);

  const updateFormData = useCallback(
    <K extends keyof ApplicationFormData>(
      section: K,
      data: Partial<ApplicationFormData[K]>
    ) => {
      setFormData((prev) => ({
        ...prev,
        [section]: { ...(prev[section] as object), ...(data as object) },
      }));
    },
    []
  );

  const setActiveStep = useCallback((step: FormStep) => {
    setActiveStepState(step);
    // Scroll to top on step change
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goToNextStep = useCallback(() => {
    setActiveStepState((prev) => Math.min(prev + 1, STEP_COUNT - 1) as FormStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goToPreviousStep = useCallback(() => {
    setActiveStepState((prev) => Math.max(prev - 1, 0) as FormStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const validateStep = useCallback((step: FormStep): StepValidation => validateStepData(step, formData), [formData]);

  const stepValidations: Record<FormStep, StepValidation> = {
    0: validateStep(0),
    1: validateStep(1),
    2: validateStep(2),
    3: validateStep(3),
  };

  const onPhoneVerified = useCallback((phone: string) => {
    setFormData((prev) => {
      // The verified number carries its own code (+91..., +971...).
      return {
        ...prev,
        personal: {
          ...prev.personal,
          ...fromStoredPhone(phone, prev.personal.phoneCountry),
          phoneVerified: true,
          phoneVerifiedAt: new Date().toISOString(),
        },
      };
    });
    setShowPhoneVerification(false);
    // The verified number may have switched to an older account: read it again.
    setAccountRefresh((n) => n + 1);
  }, []);

  const refreshAccount = useCallback(() => setAccountRefresh((n) => n + 1), []);

  const isFieldPrefilled = useCallback(
    (field: string) => prefilledFields.has(field),
    [prefilledFields]
  );

  const setTermsAccepted = useCallback((accepted: boolean) => {
    setFormData((prev) => ({ ...prev, termsAccepted: accepted }));
  }, []);

  const refreshApplications = useCallback(async () => {
    if (!user) return;
    try {
      const idToken = await (user.raw as any)?.getIdToken?.();
      if (!idToken) return;
      const res = await fetch('/api/application', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const { data: applications } = await res.json();
        setExistingApplications(applications || []);
      }
    } catch (error) {
      console.error('Failed to refresh applications:', error);
    }
  }, [user]);

  const removeApplication = useCallback(async (id: string): Promise<boolean> => {
    try {
      const idToken = await (user?.raw as any)?.getIdToken?.();
      if (!idToken) return false;

      const res = await fetch(`/api/application?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (!res.ok) return false;

      // Remove from local state
      setExistingApplications((prev) => {
        const remaining = prev.filter((app) => app.id !== id);
        // If no apps remain, switch to new-form mode
        if (remaining.length === 0) {
          setReturnUserMode('new-form');
          setActiveStep(0 as FormStep);
        }
        return remaining;
      });

      return true;
    } catch (error) {
      console.error('Failed to delete application:', error);
      return false;
    }
  }, [user, setReturnUserMode, setActiveStep]);

  const markApplicationStarted = useCallback(() => {
    try {
      if (sessionStorage.getItem(STARTED_KEY)) return;
      sessionStorage.setItem(STARTED_KEY, '1');
    } catch {
      // sessionStorage unavailable: fire once per mount instead
    }
    trackTaxonomyEvent('application_started');
  }, []);

  /**
   * Review pressed "Continue to payment": write the application (POST, or
   * PATCH when editing a submitted one), remember what came back so the pay
   * step and a reload both find it, and leave the draft in localStorage until
   * payment succeeds or the user starts over.
   */
  const submitApplication = useCallback(async (): Promise<SubmitResult> => {
    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      const idToken = await (user?.raw as any)?.getIdToken?.();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) headers.Authorization = `Bearer ${idToken}`;

      const { method, url } = submitRequest({ returnUserMode, draftId, submittedId: submittedApplication?.id ?? null });
      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(buildSubmitPayload(formData)),
      });
      const result = await response.json();
      if (!result?.success || !result.data?.id) {
        const error = result?.error || 'errors.submitFailed';
        setSubmissionError(error);
        return { ok: false, error };
      }
      const submitted = { id: result.data.id as string, applicationNumber: (result.data.application_number as string) || null };
      setSubmittedApplication(submitted);
      setDraftId(submitted.id);
      return { ok: true, ...submitted };
    } catch (error) {
      console.error('Submission error:', error);
      setSubmissionError('errors.submitFailed');
      return { ok: false, error: 'errors.submitFailed' };
    } finally {
      setIsSubmitting(false);
    }
  }, [user, returnUserMode, draftId, formData, submittedApplication]);

  const value: FormContextType = {
    formData,
    setFormData,
    updateFormData,
    setTermsAccepted,
    activeStep,
    setActiveStep,
    goToNextStep,
    goToPreviousStep,
    isFirstStep: activeStep === 0,
    isLastStep: activeStep === STEP_COUNT - 1,
    validateStep,
    stepValidations,
    showPhoneVerification,
    setShowPhoneVerification,
    onPhoneVerified,
    prefilledFields,
    isFieldPrefilled,
    isSubmitting,
    setIsSubmitting,
    submissionError,
    setSubmissionError,
    clearSavedForm,
    forgetDraft,
    saveDraftToDb,
    isSavingDraft,
    draftId,
    setDraftId,
    isAuthenticated: !!user,
    isAuthLoading: authLoading,
    existingApplications,
    isReturningUser,
    returnUserMode,
    setReturnUserMode,
    returningUserCheckComplete,
    prefillFromExistingApplication,
    removeApplication,
    refreshApplications,
    submitApplication,
    submittedApplication,
    markApplicationStarted,
    isReturningAccount,
    refreshAccount,
  };

  return <FormContext.Provider value={value}>{children}</FormContext.Provider>;
}

// ============================================
// HOOK
// ============================================

export function useFormContext() {
  const context = useContext(FormContext);
  if (!context) {
    throw new Error('useFormContext must be used within a FormProvider');
  }
  return context;
}
