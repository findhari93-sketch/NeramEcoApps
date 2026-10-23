'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Container,
  Stepper,
  Step,
  StepLabel,
  Button,
  Typography,
  Alert,
  CircularProgress,
  useMediaQuery,
  useTheme,
  MobileStepper,
  Paper,
  Skeleton,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from '@neram/ui';
import { KeyboardArrowLeft, KeyboardArrowRight, CheckCircleOutlined, ErrorOutline, TimerOff, Google, Refresh, SupportAgent, Save as SaveIcon, PhoneIphone, Close } from '@mui/icons-material';
import { useFirebaseAuth, getCurrentUser } from '@neram/auth';
import { LoginModal } from '@neram/ui';
import { useSearchParams } from 'next/navigation';
import { invalidateApplicationStatus } from '@/hooks/useApplicationStatus';
import PersonalDetailsStep from './PersonalDetailsStep';
import AcademicDetailsStep from './AcademicDetailsStep';
import PaymentDetailsStep from './PaymentDetailsStep';
import ReviewStep from './ReviewStep';
import SuccessScreen from './SuccessScreen';
import ApplicationDetailsDialog from './ApplicationDetailsDialog';
import PlanChoiceStep from './PlanChoiceStep';
import PayStep from './PayStep';
import PaymentSubmittedScreen from './PaymentSubmittedScreen';
import { fetchPaymentMethods, createIntent, startInstantOrder, pollInstantOrder, cancelInstantOrder, type PaymentMethodsView } from './instant-upi-client';
import { rupees, istTodayKey, addDays, type StudentPayLinkData, type PaymentSubmission, formatDay } from './student-pay-types';
import { useEnrollmentProgress } from '@/hooks/useEnrollmentProgress';
import { useEnrollmentDraftSync } from '@/hooks/useEnrollmentDraftSync';
import { planResume, resumeMessage, type ServerResume } from './resume';
import { splitEnrolPhone, joinEnrolPhone } from './enrolPhone';
import { getCountryConfig } from '@/components/apply/countryConfig';
import type {
  PersonalInfoData,
  LocationData,
  AcademicDetailsData,
  PaymentDetailsData,
} from '@/components/apply/types';
import { DEFAULT_FORM_DATA } from '@/components/apply/types';

const STEP_LABELS = ['Personal Details', 'Academic Details', 'Payment Details', 'Review & Confirm'];
/** Student-pays links: the student chooses the plan and pays on the last step. */
const PAY_STEP_LABELS = ['Your details', 'Your studies', 'Choose plan', 'Pay'];

interface LinkData {
  token: string;
  studentName: string;
  studentPhone: string | null;
  interestCourse: string;
  learningMode: string;
  courseId: string | null;
  batchId: string | null;
  centerId: string | null;
  courseName: string | null;
  batchName: string | null;
  centerName: string | null;
  totalFee: number;
  discountAmount: number;
  finalFee: number;
  amountPaid: number;
  paymentMethod: string | null;
  expiresAt: string;
  /** Made from a demo: the copy says "the number you used for your demo". */
  forDemo?: boolean;
  /** Tied to an account: sign in phone-first with that account's number. */
  forAccount?: boolean;
  /** That number with the middle hidden, e.g. 90******77. */
  maskedPhone?: string | null;
  paymentScheme?: 'full' | 'installment' | null;
  balanceDueDate?: string | null;
  linkStatus?: 'active' | 'payment_submitted';
  paymentMode?: 'recorded' | 'student_pays';
  offer?: StudentPayLinkData['offer'];
  payee?: StudentPayLinkData['payee'];
  qrCodes?: StudentPayLinkData['qrCodes'];
  detailsSavedAt?: string | null;
  paymentNote?: string;
  rejectionReason?: string | null;
  prefill?: StudentPayLinkData['prefill'];
}

/** The fee line on the sign-in card: what was paid, or what there is to pay. */
function feeSummary(link: LinkData): string {
  if (link.paymentMode === 'student_pays' && link.offer) {
    const o = link.offer;
    return o.allowsInstallments && o.installment1
      ? `Pay in full ${rupees(o.fullAmount)}, or ${rupees(o.installment1)} now and ${rupees(o.installment2)} later`
      : `Fee: ${rupees(o.fullAmount)}`;
  }
  return `Fee: ${rupees(link.finalFee)} | Paid: ${rupees(link.amountPaid)}`;
}

/** The app hosts register-user, verify-phone and adopt-account for every site. */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';

interface LeadProfileData {
  id: string;
  firstName: string | null;
  email: string | null;
  phone: string | null;
  fatherName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  district: string | null;
  pincode: string | null;
  address: string | null;
  applicantCategory: string | null;
  academicData: Record<string, unknown> | null;
  casteCategory: string | null;
  targetExamYear: number | null;
  schoolType: string | null;
  parentPhone: string | null;
  learningMode: string | null;
}

interface UsedLinkData {
  applicationNumber: string | null;
  studentName: string | null;
  interestCourse: string | null;
  courseName: string | null;
  totalFee: number | null;
  amountPaid: number | null;
  finalFee: number | null;
  enrolledAt: string | null;
  hasEnrolledUser?: boolean;
  leadProfile?: LeadProfileData | null;
  isOwner?: boolean;
}


export default function EnrollWizard() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const { user, loading: authLoading, signInWithGoogle, signOut } = useFirebaseAuth();

  // Demo links: phone sign-in dialog, and "signed in with the wrong account".
  const [showSignIn, setShowSignIn] = useState(false);
  const [wrongAccount, setWrongAccount] = useState(false);

  // Session persistence: this browser's copy (every keystroke, 7 days) and the
  // link's copy (checkpoints, any device). The newest wins on arrival.
  const { restoredState, saveProgress, clearProgress } = useEnrollmentProgress(token);
  const [resumeChecked, setResumeChecked] = useState(false);
  const [resumeInfo, setResumeInfo] = useState<{ step: number; savedAt: string } | null>(null);

  // Token validation state
  const [tokenStatus, setTokenStatus] = useState<'loading' | 'valid' | 'invalid' | 'expired' | 'used' | 'submitted'>('loading');
  // Student-pays: the payment the student submitted, waiting for staff.
  const [submission, setSubmission] = useState<PaymentSubmission | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [tokenError, setTokenError] = useState<string>('');
  const [linkData, setLinkData] = useState<LinkData | null>(null);
  const [usedLinkData, setUsedLinkData] = useState<UsedLinkData | null>(null);

  // Form state - initialize from restored state if available
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const formDataRef = useRef(formData);
  formDataRef.current = formData;
  const [submitting, setSubmitting] = useState(false);
  const [payLaterBusy, setPayLaterBusy] = useState(false);
  const [payLaterSaved, setPayLaterSaved] = useState<{ emailedTo: string | null } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [applicationNumber, setApplicationNumber] = useState<string | null>(null);

  // Phone verification
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneVerifiedAt, setPhoneVerifiedAt] = useState<string | null>(null);
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [showPhoneModal, setShowPhoneModal] = useState(false);

  // Terms
  const [termsAccepted, setTermsAccepted] = useState(false);

  // View/edit mode for revisiting completed enrollment
  const [viewMode, setViewMode] = useState(true); // true = read-only, false = editing
  const [editMode, setEditMode] = useState(false); // true = show edit form, false = show success screen
  const [showApplicationDialog, setShowApplicationDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);


  // Error page state
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [showTicketDialog, setShowTicketDialog] = useState(false);
  const [requestName, setRequestName] = useState('');
  const [requestEmail, setRequestEmail] = useState('');
  const [requestPhone, setRequestPhone] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestResult, setRequestResult] = useState<{ ticketNumber: string; message: string } | null>(null);
  const [ticketResult, setTicketResult] = useState<{ ticketNumber: string } | null>(null);
  // Which ways to pay are on, asked once the Pay step is reached (Instant UPI hides itself when off).
  const [methodsView, setMethodsView] = useState<PaymentMethodsView | null>(null);
  useEffect(() => {
    if (currentStep !== 3 || methodsView || linkData?.paymentMode !== 'student_pays') return;
    let alive = true;
    fetchPaymentMethods().then((m) => {
      if (alive) setMethodsView(m || { upiAuto: { available: false, reason: 'error', orderMinutes: 30, mode: 'shadow' }, upiProof: { available: true }, bankProof: { available: true }, razorpay: { available: false, feePercent: 0 } });
    });
    return () => {
      alive = false;
    };
  }, [currentStep, methodsView, linkData?.paymentMode]);

  // Resume once signed in: the newest of this browser's copy, the draft on the
  // link and the application saved with "pay later". Until this has run the
  // steps are not shown, so nothing typed is overwritten.
  useEffect(() => {
    if (tokenStatus !== 'valid' || !user || !token || resumeChecked) return;
    let alive = true;
    (async () => {
      let server: ServerResume | null = null;
      try {
        const idToken = await getCurrentUser()?.getIdToken();
        if (idToken) {
          const res = await fetch(`/api/enroll/draft?token=${encodeURIComponent(token)}`, { headers: { Authorization: `Bearer ${idToken}` } });
          if (res.ok) server = (await res.json())?.data || null;
        }
      } catch {
        // No answer: this browser's copy, if any, still resumes.
      }
      if (!alive) return;
      const local = restoredState;
      if (local) {
        setPhoneVerified(local.phoneVerified);
        setPhoneVerifiedAt(local.phoneVerifiedAt || null);
        setVerifiedPhone(local.verifiedPhone || null);
      }
      const plan = planResume({ local, server, base: formDataRef.current });
      if (plan) {
        setFormData(plan.formData);
        setCurrentStep(plan.step);
        setTermsAccepted(plan.termsAccepted);
        setResumeInfo({ step: plan.step, savedAt: plan.savedAt });
      }
      setResumeChecked(true);
    })();
    return () => {
      alive = false;
    };
  }, [tokenStatus, user, token, resumeChecked, restoredState]);

  // Save progress whenever form state changes
  useEffect(() => {
    if (tokenStatus === 'valid' && currentStep < 4) {
      saveProgress({
        currentStep,
        formData: formData as unknown as Record<string, unknown>,
        phoneVerified,
        phoneVerifiedAt,
        verifiedPhone,
        termsAccepted,
      });
    }
  }, [currentStep, formData, phoneVerified, phoneVerifiedAt, verifiedPhone, termsAccepted, tokenStatus, saveProgress]);

  // Checkpoint the draft on the link (step changes at once, edits after a pause).
  const draftSync = useEnrollmentDraftSync({
    token,
    enabled: tokenStatus === 'valid' && !!user && resumeChecked && currentStep < 4,
    step: currentStep,
    formData: formData as unknown as Record<string, unknown>,
    getIdToken: async () => (await getCurrentUser()?.getIdToken()) || null,
  });

  // Validate token — wait for auth to finish loading so we can include the token for ownership check
  useEffect(() => {
    if (!token) {
      setTokenStatus('invalid');
      setTokenError('No enrollment token provided. Please use the link shared by your admin.');
      return;
    }
    if (authLoading) return; // Wait for Firebase auth to hydrate
    // Call validate with auth if user is already signed in
    validateToken(token, user ? (user.raw as any) : undefined);
  }, [token, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-validate when user signs in AFTER initial validate already returned 'used' without owner info
  // Also re-validate when the server confirmed ownership but the lead profile is missing
  useEffect(() => {
    if (user && token && tokenStatus === 'used' && usedLinkData) {
      if (!usedLinkData.isOwner || !usedLinkData.leadProfile) {
        validateToken(token, (user.raw as any));
      }
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Populate form data from lead profile when owner revisits
  useEffect(() => {
    if (usedLinkData?.isOwner && usedLinkData.leadProfile) {
      const lp = usedLinkData.leadProfile;
      setFormData((prev) => ({
        ...prev,
        personal: {
          ...prev.personal,
          firstName: lp.firstName || prev.personal.firstName,
          email: lp.email || prev.personal.email,
          phone: lp.phone || prev.personal.phone,
          fatherName: lp.fatherName || prev.personal.fatherName,
          dateOfBirth: lp.dateOfBirth || prev.personal.dateOfBirth,
          gender: (lp.gender as 'male' | 'female' | 'other') || prev.personal.gender,
          parentPhone: lp.parentPhone || prev.personal.parentPhone,
        },
        location: {
          ...prev.location,
          country: lp.country || prev.location.country,
          state: lp.state || prev.location.state,
          city: lp.city || prev.location.city,
          district: lp.district || prev.location.district,
          pincode: lp.pincode || prev.location.pincode,
          address: lp.address || prev.location.address,
        },
        academic: {
          ...prev.academic,
          applicantCategory: (lp.applicantCategory as any) || prev.academic.applicantCategory,
          casteCategory: lp.casteCategory || prev.academic.casteCategory,
          targetExamYear: lp.targetExamYear ? String(lp.targetExamYear) : prev.academic.targetExamYear,
          schoolType: lp.schoolType || prev.academic.schoolType,
        },
      } as typeof prev));
      // Mark phone as verified (was verified during enrollment)
      setPhoneVerified(true);
    }
  }, [usedLinkData?.isOwner, usedLinkData?.leadProfile]); // eslint-disable-line react-hooks/exhaustive-deps


  // What the account and the link already know: name, email, phone (Google
  // account, then the number staff put on the link) and the payment method.
  const withAccountDefaults = (prev: typeof DEFAULT_FORM_DATA): typeof DEFAULT_FORM_DATA => {
    if (!user || !linkData) return prev;
    const adminPhone = linkData.studentPhone
      ? (linkData.studentPhone.startsWith('+') ? linkData.studentPhone : `+91${linkData.studentPhone}`)
      : '';
    return {
      ...prev,
      personal: {
        ...prev.personal,
        firstName: prev.personal.firstName || user.name?.split(' ')[0] || '',
        email: user.email || prev.personal.email,
        phone: user.phone || prev.personal.phone || adminPhone,
      },
      payment: {
        ...prev.payment,
        paymentMethod: prev.payment.paymentMethod || linkData.paymentMethod || '',
      },
    };
  };
  useEffect(() => {
    if (user && linkData) setFormData((prev) => withAccountDefaults(prev));
  }, [user, linkData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Student-pays links: fill blanks from the demo the student booked, and
  // start the payment on UPI with today's date. Never overwrites an answer.
  const prefilledFromDemo = useRef(false);
  useEffect(() => {
    if (!linkData || linkData.paymentMode !== 'student_pays' || prefilledFromDemo.current) return;
    prefilledFromDemo.current = true;
    const p = linkData.prefill;
    setFormData((prev) => {
      const next = { ...prev, personal: { ...prev.personal }, location: { ...prev.location }, academic: { ...prev.academic }, payment: { ...prev.payment } };
      if (p) {
        if (!next.personal.email && p.email) next.personal.email = p.email;
        if (!next.personal.fatherName && p.fatherName) next.personal.fatherName = p.fatherName;
        if (!next.personal.parentPhone && p.parentPhone) next.personal.parentPhone = p.parentPhone;
        if (!next.location.city && p.city) next.location.city = p.city;
        if (!next.academic.targetExamYear && p.targetExamYear) next.academic.targetExamYear = p.targetExamYear;
        if (!next.academic.applicantCategory && p.currentClass) {
          next.academic.applicantCategory = 'school_student' as any;
          next.academic.schoolStudentData = {
            ...(next.academic.schoolStudentData || { current_class: '', school_name: '', board: '' }),
            current_class: p.currentClass,
          } as any;
        }
      }
      if (!next.payment.paymentMethod || next.payment.paymentMethod === 'cash') next.payment.paymentMethod = 'upi_direct';
      if (!next.payment.paymentDate || next.payment.paymentDate > istTodayKey()) next.payment.paymentDate = istTodayKey();
      if (!linkData.offer?.allowsInstallments) next.payment.paymentType = 'full';
      return next;
    });
  }, [linkData]);

  // Auto-detect phone verified from Firebase (Fix 2)
  useEffect(() => {
    if (user && linkData && !phoneVerified) {
      if (user.phoneVerified && user.phone) {
        const phone = user.phone.startsWith('+') ? user.phone : `+91${user.phone}`;
        setPhoneVerified(true);
        setPhoneVerifiedAt(new Date().toISOString());
        setVerifiedPhone(phone);
      }
    }
  }, [user, linkData, phoneVerified]);

  // Auto-fill from Google auth for USED tokens (revisiting enrollment)
  useEffect(() => {
    if (user && tokenStatus === 'used' && usedLinkData) {
      setFormData((prev) => ({
        ...prev,
        personal: {
          ...prev.personal,
          email: prev.personal.email || user.email || '',
          phone: prev.personal.phone || user.phone || '',
          firstName: prev.personal.firstName || user.name?.split(' ')[0] || '',
        },
      }));
    }
  }, [user, tokenStatus, usedLinkData]);

  // The number the account already proved by OTP beats one carried in by the
  // link or an older save. Without this a link made with a wrong number kept
  // putting that number back after every resume, so a student whose own number
  // was verified still read "Phone verification is required". Once per visit,
  // after the resume, so a number the student then types is left alone.
  const accountPhoneApplied = useRef(false);
  useEffect(() => {
    if (!resumeChecked || accountPhoneApplied.current || !user?.phoneVerified || !user.phone) return;
    accountPhoneApplied.current = true;
    const own = user.phone.startsWith('+') ? user.phone : `+91${user.phone}`;
    setVerifiedPhone(own);
    setPhoneVerified(true);
    setPhoneVerifiedAt((at) => at || new Date().toISOString());
    if (formDataRef.current.personal.phone === own) return;
    setFormData((prev) => ({
      ...prev,
      personal: { ...prev.personal, phone: own, phoneCountry: splitEnrolPhone(own, 'IN').phoneCountry },
    }));
  }, [resumeChecked, user]);

  // Derive whether phone is currently verified (resets when user edits number)
  const isPhoneCurrentlyVerified = phoneVerified && !!verifiedPhone && verifiedPhone === formData.personal.phone;
  // The number and code the Verify dialog opens on.
  const verifyPhoneParts = splitEnrolPhone(formData.personal.phone || linkData?.studentPhone || '', formData.personal.phoneCountry);

  const validateToken = async (t: string, firebaseUserOverride?: any) => {
    try {
      setTokenStatus('loading');

      // Try to include auth token for ownership check (optional, fails gracefully)
      const headers: Record<string, string> = {};
      try {
        const firebaseUser = firebaseUserOverride || getCurrentUser();
        if (firebaseUser) {
          const idToken = await firebaseUser.getIdToken();
          if (idToken) headers.Authorization = `Bearer ${idToken}`;
        }
      } catch {
        // Auth not available yet — that's fine, validate works without it
      }

      const res = await fetch(`/api/enroll/validate?token=${encodeURIComponent(t)}`, { headers });
      const data = await res.json();

      if (!res.ok) {
        const code = data.code || '';
        if (code === 'ALREADY_USED') {
          setTokenStatus('used');
          if (data.data?.applicationNumber) {
            setApplicationNumber(data.data.applicationNumber);
          }
          setUsedLinkData(data.data || null);
        } else if (code === 'EXPIRED' || code === 'CANCELLED') {
          setTokenStatus('expired');
        } else {
          setTokenStatus('invalid');
        }
        setTokenError(data.error || 'Invalid link');
        clearProgress();
        return;
      }

      if (data.data?.linkStatus === 'payment_submitted') {
        setLinkData(data.data);
        setSubmission(data.data.submission || null);
        setTokenStatus('submitted');
        clearProgress();
        return;
      }

      setLinkData(data.data);
      setTokenStatus('valid');
    } catch {
      setTokenStatus('invalid');
      setTokenError('Failed to validate the enrollment link. Please try again.');
    }
  };

  const updatePersonalData = useCallback((data: Partial<PersonalInfoData>) => {
    setFormData((prev) => ({
      ...prev,
      personal: { ...prev.personal, ...data },
    }));
  }, []);

  const updateLocationData = useCallback((data: Partial<LocationData>) => {
    setFormData((prev) => ({
      ...prev,
      location: { ...prev.location, ...data },
    }));
  }, []);

  const updateAcademicData = useCallback((data: Partial<AcademicDetailsData>) => {
    setFormData((prev) => ({
      ...prev,
      academic: { ...prev.academic, ...data },
    }));
  }, []);

  const updatePaymentData = useCallback((data: Partial<PaymentDetailsData>) => {
    setFormData((prev) => ({
      ...prev,
      payment: { ...prev.payment, ...data },
    }));
  }, []);

  const handleNext = () => {
    setCurrentStep((prev) => Math.min(prev + 1, 3));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // "Start over": forget both copies of the draft; the account's own details stay.
  const startOver = () => {
    clearProgress();
    void draftSync.clear();
    setResumeInfo(null);
    setFieldErrors({});
    setTermsAccepted(false);
    setFormData(withAccountDefaults(DEFAULT_FORM_DATA));
    setCurrentStep(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getAcademicDataForSubmit = () => {
    const { applicantCategory } = formData.academic;
    if (applicantCategory === 'school_student') return formData.academic.schoolStudentData;
    if (applicantCategory === 'diploma_student') return formData.academic.diplomaStudentData;
    if (applicantCategory === 'college_student') return formData.academic.collegeStudentData;
    if (applicantCategory === 'working_professional') return formData.academic.workingProfessionalData;
    return null;
  };

  /** What /api/enroll/complete and /api/payments/intents both take. Amounts are never in it. */
  const buildEnrolBody = (intent: 'submit' | 'pay_later' | 'instant') => ({
    token: linkData?.token,
    firstName: formData.personal.firstName,
    fatherName: formData.personal.fatherName,
    dateOfBirth: formData.personal.dateOfBirth,
    gender: formData.personal.gender,
    country: formData.location.country,
    state: formData.location.state,
    city: formData.location.city,
    district: formData.location.district,
    pincode: formData.location.pincode,
    address: formData.location.address,
    applicantCategory: formData.academic.applicantCategory,
    academicData: getAcademicDataForSubmit(),
    casteCategory: formData.academic.casteCategory,
    targetExamYear: formData.academic.targetExamYear,
    schoolType: formData.academic.schoolType,
    parentPhone: formData.personal.parentPhone,
    // The student's OWN number, so the server can persist it on users.phone.
    // Google-login students have no phone on their user row, and that number
    // is the key the admin Entra reconciler uses to recognise them later.
    studentPhone: verifiedPhone || formData.personal.phone || null,
    phoneVerified,
    phoneVerifiedAt,
    // Payment details from student
    paymentDate: formData.payment.paymentDate,
    paymentType: formData.payment.paymentType,
    installmentNumber: formData.payment.installmentNumber,
    paymentMethod: formData.payment.paymentMethod,
    transactionReference: formData.payment.transactionReference,
    paymentProofUrl: formData.payment.paymentProofUrl,
    // Student-pays: the plan. The amount is the server's, never sent.
    scheme: formData.payment.paymentType,
    proofChannel: formData.payment.proofChannel || 'upload',
    whatsappSent: formData.payment.whatsappSent === true,
    payerName: formData.payment.payerName || null,
    // Instant UPI enrols without the submit button, so the server checks the terms too.
    termsAccepted,
    // 'pay_later' saves the details and emails how to pay; nothing is claimed.
    intent,
  });

  const handleSubmit = async (intent?: 'pay_later') => {
    // Guard: this is sometimes handed straight to a button's onClick, which would
    // pass the click event in as `intent`. Serialising that event (it points back
    // at the HTMLButtonElement via a React fiber) throws "Converting circular
    // structure to JSON" and loses the submit. Only the literal 'pay_later' string
    // is honoured; anything else, including an event, is a normal submit.
    const resolvedIntent: 'submit' | 'pay_later' = intent === 'pay_later' ? 'pay_later' : 'submit';
    if (!user || !linkData) return;
    const setBusy = resolvedIntent === 'pay_later' ? setPayLaterBusy : setSubmitting;

    setBusy(true);
    setSubmitError(null);

    try {
      const firebaseUser = getCurrentUser();
      const idToken = await firebaseUser?.getIdToken();

      const res = await fetch('/api/enroll/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(buildEnrolBody(resolvedIntent)),
      });

      const data = await res.json();

      if (!res.ok) {
        setFieldErrors(data.fieldErrors || {});
        // A demo link opened with a different, established account: nothing was
        // written. Offer to switch to the demo number (progress is kept).
        if (data.code === 'WRONG_ACCOUNT') {
          setWrongAccount(true);
          throw new Error(data.error || 'Sign in with the number on your Neram account.');
        }
        // If link was already used, redirect to success/owner view
        if (data.error?.includes('Invalid or expired') || data.error?.includes('already enrolled')) {
          clearProgress();
          // Re-validate to show the owner view
          validateToken(linkData.token, user ? (user.raw as any) : undefined);
          return;
        }
        throw new Error(data.error || 'Failed to complete enrollment');
      }

      // Pay later: details are on the link; keep the local progress so they can continue here.
      if (data.data?.status === 'details_saved') {
        setFieldErrors({});
        setPayLaterSaved({ emailedTo: data.data.emailedTo || null });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      // Clear saved progress on success
      clearProgress();
      void draftSync.clear();
      setFieldErrors({});

      // Student-pays: a claim waiting for staff, not an enrolment yet.
      if (data.data?.status === 'payment_submitted') {
        setSubmission(data.data);
        setTokenStatus('submitted');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      // Invalidate application status so Header re-fetches and shows "Go to App"
      invalidateApplicationStatus();

      setApplicationNumber(data.data.applicationNumber);
      setCurrentStep(4); // Success
    } catch (err: any) {
      setSubmitError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // Instant UPI: the intent is created from the same form body the complete
  // route takes, so auto-fulfilment enrols from the saved details.
  const startInstantUpi = async () => {
    const intentId = await createIntent(buildEnrolBody('instant'));
    return startInstantOrder(intentId);
  };
  const onInstantUpiDone = () => {
    clearProgress();
    void draftSync.clear();
    invalidateApplicationStatus();
    if (linkData) validateToken(linkData.token, user ? (user.raw as any) : undefined);
  };

  // Save updated enrollment details
  const handleSaveUpdates = async () => {
    if (!user || !usedLinkData?.leadProfile?.id) return;

    setSaving(true);
    setSaveSuccess(false);
    setSubmitError(null);

    try {
      const firebaseUser = getCurrentUser();
      const idToken = await firebaseUser?.getIdToken();

      const res = await fetch('/api/enroll/update', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          leadProfileId: usedLinkData.leadProfile.id,
          firstName: formData.personal.firstName,
          fatherName: formData.personal.fatherName,
          dateOfBirth: formData.personal.dateOfBirth,
          gender: formData.personal.gender,
          country: formData.location.country,
          state: formData.location.state,
          city: formData.location.city,
          district: formData.location.district,
          pincode: formData.location.pincode,
          address: formData.location.address,
          applicantCategory: formData.academic.applicantCategory,
          casteCategory: formData.academic.casteCategory,
          targetExamYear: formData.academic.targetExamYear,
          schoolType: formData.academic.schoolType,
          parentPhone: formData.personal.parentPhone,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');

      setSaveSuccess(true);
      setViewMode(true);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };


  // Request link regeneration
  const handleRequestRegeneration = async () => {
    if (!token || !requestName) return;

    setRequestLoading(true);
    try {
      const res = await fetch('/api/enroll/request-regeneration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          studentName: requestName,
          studentEmail: requestEmail,
          studentPhone: requestPhone,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit request');
      }

      setRequestResult({
        ticketNumber: data.ticketNumber,
        message: data.message || 'Your request has been sent to the admin.',
      });
    } catch (err: any) {
      setRequestResult({
        ticketNumber: '',
        message: err.message || 'Something went wrong. Please try again.',
      });
    } finally {
      setRequestLoading(false);
    }
  };

  // Raise a support ticket
  const handleRaiseTicket = async () => {
    if (!requestName || !ticketDescription) return;

    setRequestLoading(true);
    try {
      const res = await fetch('/api/support-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: requestName,
          userEmail: requestEmail,
          userPhone: requestPhone,
          category: 'enrollment_issue',
          subject: `Enrollment Link Issue${token ? ` - Token: ${token.slice(0, 8)}...` : ''}`,
          description: ticketDescription,
          pageUrl: typeof window !== 'undefined' ? window.location.href : '',
          sourceApp: 'marketing',
          enrollmentLinkToken: token,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit ticket');
      }

      setTicketResult({ ticketNumber: data.ticketNumber });
    } catch (err: any) {
      setTicketResult({ ticketNumber: '' });
    } finally {
      setRequestLoading(false);
    }
  };

  // ============================================
  // ERROR STATES
  // ============================================

  if (tokenStatus === 'loading') {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
        <CircularProgress size={48} sx={{ mb: 3 }} />
        <Typography variant="h6" color="text.secondary">
          Validating your enrollment link...
        </Typography>
      </Container>
    );
  }

  if (tokenStatus === 'submitted' && submission) {
    return <PaymentSubmittedScreen studentName={formData.personal.firstName || linkData?.studentName || null} submission={submission} />;
  }

  if (tokenStatus === 'invalid') {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
        <ErrorOutline sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Invalid Enrollment Link
        </Typography>
        <Typography color="text.secondary" mb={3}>
          {tokenError}
        </Typography>
        <Alert severity="info" sx={{ mb: 3, textAlign: 'left' }}>
          The link may be incorrect or no longer available. You can raise a support ticket and our team will help you.
        </Alert>
        <Button
          variant="outlined"
          startIcon={<SupportAgent />}
          onClick={() => setShowTicketDialog(true)}
          sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 600 }}
        >
          Raise a Ticket
        </Button>

        {/* Ticket Dialog */}
        <TicketDialog
          open={showTicketDialog}
          onClose={() => setShowTicketDialog(false)}
          requestName={requestName}
          setRequestName={setRequestName}
          requestEmail={requestEmail}
          setRequestEmail={setRequestEmail}
          requestPhone={requestPhone}
          setRequestPhone={setRequestPhone}
          ticketDescription={ticketDescription}
          setTicketDescription={setTicketDescription}
          onSubmit={handleRaiseTicket}
          loading={requestLoading}
          result={ticketResult}
        />
      </Container>
    );
  }

  if (tokenStatus === 'expired') {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
        <TimerOff sx={{ fontSize: 64, color: 'warning.main', mb: 2 }} />
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Link Expired
        </Typography>
        <Typography color="text.secondary" mb={3}>
          {tokenError}
        </Typography>
        <Alert severity="warning" sx={{ mb: 3, textAlign: 'left' }}>
          This enrollment link has expired. You can request a new link from your admin or raise a support ticket.
        </Alert>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, width: '100%' }}>
          <Button
            variant="contained"
            startIcon={<Refresh />}
            onClick={() => setShowRequestDialog(true)}
            sx={{ borderRadius: 1, fontWeight: 600, textTransform: 'none' }}
          >
            Request New Link
          </Button>
          <Button
            variant="outlined"
            startIcon={<SupportAgent />}
            onClick={() => setShowTicketDialog(true)}
            sx={{ borderRadius: 1, textTransform: 'none' }}
          >
            Raise a Ticket
          </Button>
        </Box>

        {/* Request New Link Dialog */}
        <RequestRegenerationDialog
          open={showRequestDialog}
          onClose={() => setShowRequestDialog(false)}
          requestName={requestName}
          setRequestName={setRequestName}
          requestEmail={requestEmail}
          setRequestEmail={setRequestEmail}
          requestPhone={requestPhone}
          setRequestPhone={setRequestPhone}
          onSubmit={handleRequestRegeneration}
          loading={requestLoading}
          result={requestResult}
        />

        {/* Ticket Dialog */}
        <TicketDialog
          open={showTicketDialog}
          onClose={() => setShowTicketDialog(false)}
          requestName={requestName}
          setRequestName={setRequestName}
          requestEmail={requestEmail}
          setRequestEmail={setRequestEmail}
          requestPhone={requestPhone}
          setRequestPhone={setRequestPhone}
          ticketDescription={ticketDescription}
          setTicketDescription={setTicketDescription}
          onSubmit={handleRaiseTicket}
          loading={requestLoading}
          result={ticketResult}
        />
      </Container>
    );
  }

  if (tokenStatus === 'used') {
    const isOwner = Boolean(usedLinkData?.isOwner);

    // Owner viewing their enrollment — show Welcome screen or edit form
    if (isOwner && usedLinkData?.leadProfile) {
      const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.neramclasses.com';
      const lp = usedLinkData.leadProfile;

      // Not in edit mode — show the Welcome/SuccessScreen with View/Edit buttons
      if (!editMode) {
        return (
          <>
            <SuccessScreen
              applicationNumber={usedLinkData.applicationNumber || '-'}
              enrollmentSummary={{
                studentName: formData.personal.firstName || usedLinkData.studentName,
                courseName: usedLinkData.courseName || usedLinkData.interestCourse?.toUpperCase(),
                totalFee: usedLinkData.totalFee,
                amountPaid: usedLinkData.amountPaid,
                enrolledAt: usedLinkData.enrolledAt,
              }}
              isRevisit
              onViewApplication={() => setShowApplicationDialog(true)}
              onEdit={() => { setEditMode(true); setCurrentStep(0); }}
            />
            <ApplicationDetailsDialog
              open={showApplicationDialog}
              onClose={() => setShowApplicationDialog(false)}
              personalData={{
                firstName: formData.personal.firstName || lp.firstName,
                email: formData.personal.email || lp.email,
                phone: formData.personal.phone || lp.phone,
                fatherName: formData.personal.fatherName || lp.fatherName,
                parentPhone: formData.personal.parentPhone || lp.parentPhone,
                dateOfBirth: formData.personal.dateOfBirth || lp.dateOfBirth,
                gender: formData.personal.gender || lp.gender,
              }}
              locationData={{
                pincode: formData.location.pincode || lp.pincode,
                city: formData.location.city || lp.city,
                district: formData.location.district || lp.district,
                state: formData.location.state || lp.state,
                address: formData.location.address || lp.address,
              }}
              academicData={{
                applicantCategory: lp.applicantCategory,
                casteCategory: formData.academic.casteCategory || lp.casteCategory,
                targetExamYear: formData.academic.targetExamYear || (lp.targetExamYear ? String(lp.targetExamYear) : null),
              }}
              courseData={{
                courseName: usedLinkData.courseName || usedLinkData.interestCourse?.toUpperCase(),
                totalFee: usedLinkData.totalFee,
                amountPaid: usedLinkData.amountPaid,
                finalFee: usedLinkData.finalFee,
                enrolledAt: usedLinkData.enrolledAt,
              }}
              applicationNumber={usedLinkData.applicationNumber}
            />
          </>
        );
      }

      // EDIT MODE: Editable form with stepper
      return (
        <Container maxWidth="md" sx={{ py: { xs: 2, md: 4 } }}>
          {/* Header with Save/Cancel */}
          <Paper
            elevation={0}
            sx={{
              p: { xs: 2, md: 3 },
              mb: 3,
              border: '1px solid',
              borderColor: 'success.light',
              borderRadius: 2,
              bgcolor: 'success.50',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <CheckCircleOutlined sx={{ fontSize: 32, color: 'success.main' }} />
                <Box>
                  <Typography variant="h6" fontWeight={700} color="success.dark">
                    Edit Details
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Application: <strong>{usedLinkData.applicationNumber || '-'}</strong>
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => { setEditMode(false); setSaveSuccess(false); setSubmitError(null); }}
                  sx={{ borderRadius: 1, textTransform: 'none' }}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                  onClick={async () => {
                    await handleSaveUpdates();
                    setEditMode(false);
                  }}
                  disabled={saving}
                  sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 600 }}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </Box>
            </Box>
          </Paper>

          {saveSuccess && (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSaveSuccess(false)}>
              Your details have been updated successfully.
            </Alert>
          )}

          {submitError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSubmitError(null)}>
              {submitError}
            </Alert>
          )}

          {/* Stepper */}
          {isMobile ? (
            <MobileStepper
              variant="progress"
              steps={2}
              position="static"
              activeStep={currentStep}
              sx={{ mb: 2, borderRadius: 1, bgcolor: 'grey.50' }}
              backButton={
                <Button size="small" onClick={handleBack} disabled={currentStep === 0}>
                  <KeyboardArrowLeft /> Back
                </Button>
              }
              nextButton={
                <Button size="small" onClick={handleNext} disabled={currentStep === 1}>
                  Next <KeyboardArrowRight />
                </Button>
              }
            />
          ) : (
            <Stepper activeStep={currentStep} sx={{ mb: 4 }}>
              {['Personal Details', 'Academic Details'].map((label, index) => (
                <Step
                  key={label}
                  completed={false}
                  sx={{ cursor: 'pointer' }}
                  onClick={() => {
                    setCurrentStep(index);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>
          )}

          {/* Form content */}
          <Paper
            elevation={0}
            sx={{
              p: { xs: 2, md: 3 },
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              mb: 3,
            }}
          >
            <fieldset
              disabled={false}
              style={{ border: 'none', padding: 0, margin: 0 }}
            >
              {currentStep === 0 && (
                <PersonalDetailsStep
                  personal={formData.personal}
                  location={formData.location}
                  updatePersonal={updatePersonalData}
                  updateLocation={updateLocationData}
                  phoneVerified={true}
                  onVerifyPhone={() => {}}
                />
              )}
              {currentStep === 1 && (
                <AcademicDetailsStep
                  academic={formData.academic}
                  updateAcademic={updateAcademicData}
                />
              )}
            </fieldset>
          </Paper>

          {/* Navigation */}
          <Box display="flex" justifyContent="space-between" gap={2}>
            <Button
              variant="outlined"
              onClick={handleBack}
              disabled={currentStep === 0}
              startIcon={<KeyboardArrowLeft />}
              sx={{ borderRadius: 1 }}
            >
              Back
            </Button>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {currentStep === 0 && (
                <Button
                  variant="outlined"
                  onClick={handleNext}
                  endIcon={<KeyboardArrowRight />}
                  sx={{ borderRadius: 1 }}
                >
                  Next
                </Button>
              )}
            </Box>
          </Box>
        </Container>
      );
    }

    // Owner but no lead profile data (fallback to success screen)
    if (isOwner && applicationNumber) {
      return (
        <SuccessScreen
          applicationNumber={applicationNumber}
          enrollmentSummary={usedLinkData ? {
            studentName: usedLinkData.studentName,
            courseName: usedLinkData.courseName || usedLinkData.interestCourse?.toUpperCase(),
            totalFee: usedLinkData.totalFee,
            amountPaid: usedLinkData.amountPaid,
            enrolledAt: usedLinkData.enrolledAt,
          } : undefined}
          isRevisit
          onViewApplication={() => setShowApplicationDialog(true)}
          onEdit={() => setEditMode(true)}
        />
      );
    }

    // Not logged in — prompt to sign in
    if (!user && !authLoading) {
      return (
        <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
          <CheckCircleOutlined sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Enrollment Complete
          </Typography>
          <Typography color="text.secondary" mb={3}>
            This enrollment link has been used. Sign in with Google to view your enrollment details.
          </Typography>
          <Button
            variant="contained"
            size="large"
            onClick={signInWithGoogle}
            startIcon={<Google />}
            sx={{ py: 1.5, fontSize: '1rem', fontWeight: 600, borderRadius: 1, textTransform: 'none' }}
          >
            Sign in with Google
          </Button>
        </Container>
      );
    }

    // Logged in but not the owner, or no application number
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
        <CheckCircleOutlined sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Already Enrolled
        </Typography>
        <Typography color="text.secondary" mb={3}>
          {user && usedLinkData?.hasEnrolledUser && !isOwner
            ? 'This enrollment link was used by another student.'
            : 'This enrollment link has already been used.'}
        </Typography>
        <Button
          variant="contained"
          href={`/sso?redirect=${encodeURIComponent(process.env.NEXT_PUBLIC_APP_URL || 'https://app.neramclasses.com')}`}
          size="large"
          sx={{ borderRadius: 1, fontWeight: 600, mt: 2 }}
        >
          Go to Student App
        </Button>
      </Container>
    );
  }

  // ============================================
  // AUTH GATE
  // ============================================

  // A demo person signs in with the number they booked the demo with: phone
  // first, Google second. The card stays up while the sign-in dialog finishes
  // (the phone is saved after Firebase signs in), then the form takes over.
  if (tokenStatus === 'valid' && !authLoading && linkData?.forAccount && (!user || showSignIn)) {
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 3, md: 6 }, px: 2 }}>
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2.5, md: 4 },
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
          }}
        >
          <Typography variant="h5" component="h1" fontWeight={700} gutterBottom>
            Complete Your Enrollment
          </Typography>
          <Typography color="text.secondary" mb={1}>
            Welcome, <strong>{linkData.studentName}</strong>!
          </Typography>
          <Typography color="text.primary" mb={3}>
            {linkData.forDemo ? 'Sign in with the number you used for your demo' : 'Sign in with the number on your Neram account'}
            {linkData.maskedPhone ? (
              <> (<Box component="span" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{linkData.maskedPhone}</Box>)</>
            ) : null}
            .
          </Typography>

          <Paper
            elevation={0}
            sx={{
              p: 2,
              mb: 3,
              bgcolor: 'primary.50',
              border: '1px solid',
              borderColor: 'primary.100',
              borderRadius: 1,
            }}
          >
            <Typography variant="body2" fontWeight={600} color="primary.main" mb={1}>
              Your Course Details
            </Typography>
            <Typography variant="body2">
              Course: {linkData.courseName || linkData.interestCourse?.toUpperCase()}
            </Typography>
            <Typography variant="body2">{feeSummary(linkData)}</Typography>
          </Paper>

          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={() => setShowSignIn(true)}
            startIcon={<PhoneIphone />}
            sx={{ minHeight: 48, fontSize: '1rem', fontWeight: 600, borderRadius: 1, textTransform: 'none' }}
          >
            Sign in with phone number
          </Button>

          <Button
            variant="outlined"
            size="large"
            fullWidth
            onClick={signInWithGoogle}
            startIcon={<Google />}
            sx={{ mt: 1.5, minHeight: 48, fontSize: '1rem', fontWeight: 600, borderRadius: 1, textTransform: 'none' }}
          >
            Sign in with Google
          </Button>

          <Typography variant="body2" color="text.secondary" mt={1.5} textAlign="center">
            Use Google only if it is the account you booked the demo with.
          </Typography>
        </Paper>

        {showSignIn && (
          <LoginModal
            open={showSignIn}
            onClose={() => setShowSignIn(false)}
            phoneOnly
            apiBaseUrl={APP_URL}
            // The demo's number on its own code: a Gulf demo signs in on +971, +966 and so on.
            dialCode={getCountryConfig(splitEnrolPhone(linkData.studentPhone, 'IN').phoneCountry).phonePrefix}
            phoneLength={getCountryConfig(splitEnrolPhone(linkData.studentPhone, 'IN').phoneCountry).phoneLength}
            initialPhone={splitEnrolPhone(linkData.studentPhone, 'IN').phone}
            onAuthenticated={() => setShowSignIn(false)}
          />
        )}
      </Container>
    );
  }

  if (tokenStatus === 'valid' && !authLoading && !user) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, md: 4 },
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            textAlign: 'center',
          }}
        >
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Complete Your Enrollment
          </Typography>
          <Typography color="text.secondary" mb={1}>
            Welcome, <strong>{linkData?.studentName}</strong>!
          </Typography>
          <Typography color="text.secondary" mb={4}>
            Sign in with Google to continue your enrollment at Neram Classes.
          </Typography>

          {/* Course info summary */}
          {linkData && (
            <Paper
              elevation={0}
              sx={{
                p: 2,
                mb: 4,
                bgcolor: 'primary.50',
                border: '1px solid',
                borderColor: 'primary.100',
                borderRadius: 1,
                textAlign: 'left',
              }}
            >
              <Typography variant="body2" fontWeight={600} color="primary.main" mb={1}>
                Your Course Details
              </Typography>
              <Typography variant="body2">
                Course: {linkData.courseName || linkData.interestCourse?.toUpperCase()}
              </Typography>
              <Typography variant="body2">{feeSummary(linkData)}</Typography>
            </Paper>
          )}

          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={signInWithGoogle}
            startIcon={<Google />}
            sx={{
              py: 1.5,
              fontSize: '1rem',
              fontWeight: 600,
              borderRadius: 1,
              textTransform: 'none',
            }}
          >
            Sign in with Google
          </Button>

          <Typography variant="caption" color="text.secondary" mt={2} display="block">
            Your Google account will be used to create your student profile.
          </Typography>
        </Paper>
      </Container>
    );
  }

  if (authLoading) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
        <CircularProgress size={40} />
      </Container>
    );
  }

  // ============================================
  // SUCCESS SCREEN
  // ============================================

  if (currentStep === 4 && applicationNumber) {
    return (
      <SuccessScreen
        applicationNumber={applicationNumber}
        enrollmentSummary={{
          studentName: formData.personal.firstName || null,
          courseName: linkData?.courseName || linkData?.interestCourse?.toUpperCase() || null,
          totalFee: linkData?.totalFee ?? null,
          amountPaid: linkData?.amountPaid ?? null,
          enrolledAt: new Date().toISOString(),
        }}
      />
    );
  }

  // ============================================
  // RESUME CHECK (one round trip after sign-in)
  // ============================================

  if (tokenStatus === 'valid' && user && !resumeChecked) {
    return (
      <Container maxWidth="md" sx={{ py: { xs: 2, md: 4 } }}>
        <Box mb={3}>
          <Typography variant="h5" component="h1" fontWeight={700}>
            {linkData?.paymentMode === 'student_pays' ? 'Join Neram Classes' : 'Complete Your Enrollment'}
          </Typography>
          <Typography variant="body2" color="text.secondary" role="status" aria-live="polite">
            Checking for details you already entered...
          </Typography>
        </Box>
        <Skeleton variant="rounded" height={8} sx={{ mb: 3 }} />
        <Skeleton variant="rounded" height={56} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={56} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={56} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={56} />
      </Container>
    );
  }

  // ============================================
  // MAIN FORM
  // ============================================

  const studentPays = linkData?.paymentMode === 'student_pays' && !!linkData.offer && !!linkData.payee;
  const stepLabels = studentPays ? PAY_STEP_LABELS : STEP_LABELS;
  const payScheme: 'full' | 'installment' =
    formData.payment.paymentType === 'installment' && linkData?.offer?.allowsInstallments ? 'installment' : 'full';
  const payAmount = linkData?.offer ? (payScheme === 'installment' ? linkData.offer.installment1 ?? 0 : linkData.offer.fullAmount) : 0;

  return (
    <Container maxWidth="md" sx={{ py: { xs: 2, md: 4 } }}>
      {/* Header */}
      <Box mb={3}>
        <Typography variant="h5" component="h1" fontWeight={700}>
          {studentPays ? 'Join Neram Classes' : 'Complete Your Enrollment'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {studentPays
            ? 'Check your details, choose a plan and pay. It takes about 3 minutes.'
            : 'Fill in your details to complete enrollment at Neram Classes.'}
        </Typography>
      </Box>

      {studentPays && linkData?.rejectionReason && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          We could not confirm your last payment: {linkData.rejectionReason} Please check the details and submit again.
        </Alert>
      )}

      {studentPays && payLaterSaved && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setPayLaterSaved(null)}>
          Saved. {payLaterSaved.emailedTo ? `We emailed ${payLaterSaved.emailedTo} the payment details and this link.` : 'Your details are on this link.'} Pay whenever you are ready
          {linkData?.expiresAt ? `, before ${formatDay(String(linkData.expiresAt).slice(0, 10))}` : ''}.
        </Alert>
      )}

      {/* Resume banner */}
      {resumeInfo && (
        <Alert
          severity="info"
          sx={{
            mb: 2,
            flexWrap: { xs: 'wrap', sm: 'nowrap' },
            '& .MuiAlert-message': { flex: { xs: '1 1 0', sm: '0 1 auto' }, minWidth: 0 },
            '& .MuiAlert-action': {
              alignItems: 'center',
              pt: 0,
              width: { xs: '100%', sm: 'auto' },
              justifyContent: 'flex-end',
              ml: { xs: 0, sm: 'auto' },
              pl: { xs: 0, sm: 2 },
            },
          }}
          action={
            <Box display="flex" alignItems="center" gap={0.5}>
              <Button color="inherit" size="small" onClick={startOver} sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}>
                Start over
              </Button>
              <IconButton color="inherit" size="small" aria-label="Dismiss" onClick={() => setResumeInfo(null)} sx={{ width: 44, height: 44 }}>
                <Close fontSize="small" />
              </IconButton>
            </Box>
          }
        >
          {resumeMessage(resumeInfo, stepLabels)}
        </Alert>
      )}

      {/* Stepper */}
      {isMobile ? (
        <MobileStepper
          variant="progress"
          steps={4}
          position="static"
          activeStep={currentStep}
          sx={{ mb: 2, borderRadius: 1, bgcolor: 'grey.50' }}
          backButton={
            <Button size="small" onClick={handleBack} disabled={currentStep === 0}>
              <KeyboardArrowLeft /> Back
            </Button>
          }
          nextButton={null}
        />
      ) : (
        <Stepper activeStep={currentStep} sx={{ mb: 4 }}>
          {stepLabels.map((label, index) => (
            <Step
              key={label}
              completed={index < currentStep}
              sx={{ cursor: index < currentStep ? 'pointer' : 'default' }}
              onClick={() => {
                if (index < currentStep) {
                  setCurrentStep(index);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
            >
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      )}

      {/* Step title on mobile */}
      {isMobile && (
        <Typography variant="subtitle2" color="text.secondary" mb={2}>
          Step {currentStep + 1} of 4: {stepLabels[currentStep]}
        </Typography>
      )}

      {/* Autosave status */}
      {draftSync.status !== 'idle' && (
        <Typography
          variant="caption"
          component="p"
          role="status"
          aria-live="polite"
          color={draftSync.status === 'error' ? 'warning.dark' : 'text.secondary'}
          sx={{ mb: 2 }}
        >
          {draftSync.status === 'saved'
            ? 'Progress saved. You can continue on any device with this link.'
            : draftSync.status === 'error'
              ? 'Could not save your progress just now. We will try again as you continue.'
              : 'Saving your progress...'}
        </Typography>
      )}

      {/* Error alert */}
      {submitError && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          onClose={() => { setSubmitError(null); setWrongAccount(false); }}
        >
          {submitError}
          {wrongAccount && linkData?.forAccount && (
            <Box mt={1.5}>
              <Button
                variant="contained"
                color="error"
                startIcon={<PhoneIphone />}
                onClick={async () => {
                  setSubmitError(null);
                  setWrongAccount(false);
                  await signOut();
                }}
                sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}
              >
                {linkData?.forDemo ? 'Switch to my demo number' : 'Switch to my account number'}
              </Button>
            </Box>
          )}
        </Alert>
      )}

      {/* Step content */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 3 },
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          mb: 3,
        }}
      >
        {currentStep === 0 && (
          <PersonalDetailsStep
            personal={formData.personal}
            location={formData.location}
            updatePersonal={updatePersonalData}
            updateLocation={updateLocationData}
            phoneVerified={isPhoneCurrentlyVerified}
            onVerifyPhone={() => setShowPhoneModal(true)}
          />
        )}
        {currentStep === 1 && (
          <AcademicDetailsStep
            academic={formData.academic}
            updateAcademic={updateAcademicData}
          />
        )}
        {currentStep === 2 && studentPays && (
          <PlanChoiceStep
            offer={linkData!.offer!}
            scheme={payScheme}
            onChange={(scheme) => updatePaymentData({ paymentType: scheme })}
            accessUntil={linkData!.payee!.accessUntilLabel}
            payeeName={linkData!.payee!.payeeName}
          />
        )}
        {currentStep === 3 && studentPays && (
          <PayStep
            amount={payAmount}
            scheme={payScheme}
            balance={payScheme === 'installment' ? linkData!.offer!.installment2 : null}
            balanceDueDate={
              payScheme === 'installment'
                ? addDays(formData.payment.paymentDate || istTodayKey(), linkData!.offer!.balanceDueDays || 45)
                : null
            }
            payee={linkData!.payee!}
            qrCodes={linkData!.qrCodes || []}
            studentName={formData.personal.firstName || linkData!.studentName || null}
            onPayLater={() => handleSubmit('pay_later')}
            payLaterBusy={payLaterBusy}
            paymentNote={linkData!.paymentNote || ''}
            token={linkData!.token}
            payment={formData.payment}
            updatePayment={(d) => {
              updatePaymentData(d);
              const keys = Object.keys(d);
              if (keys.some((k) => fieldErrors[k])) {
                setFieldErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !keys.includes(k))));
              }
            }}
            termsAccepted={termsAccepted}
            setTermsAccepted={setTermsAccepted}
            phoneVerified={isPhoneCurrentlyVerified}
            instant={
              methodsView?.upiAuto.available
                ? { orderMinutes: methodsView.upiAuto.orderMinutes, mode: methodsView.upiAuto.mode || 'live', start: startInstantUpi, poll: pollInstantOrder, cancel: cancelInstantOrder, onDone: onInstantUpiDone }
                : undefined
            }
            onSubmit={handleSubmit}
            submitting={submitting}
            fieldErrors={fieldErrors}
          />
        )}
        {currentStep === 2 && !studentPays && (
          <PaymentDetailsStep
            payment={formData.payment}
            updatePayment={updatePaymentData}
            linkData={linkData!}
            token={linkData!.token}
          />
        )}
        {currentStep === 3 && !studentPays && (
          <ReviewStep
            formData={formData}
            linkData={linkData!}
            phoneVerified={isPhoneCurrentlyVerified}
            termsAccepted={termsAccepted}
            setTermsAccepted={setTermsAccepted}
            onSubmit={handleSubmit}
            submitting={submitting}
          />
        )}
      </Paper>

      {/* Phone verification warning on Step 1 */}
      {currentStep === 0 && !isPhoneCurrentlyVerified && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          Please verify your phone number before continuing.
        </Alert>
      )}

      {/* Navigation buttons */}
      <Box display="flex" justifyContent="space-between" gap={2}>
        <Button
          variant="outlined"
          onClick={handleBack}
          disabled={currentStep === 0}
          startIcon={<KeyboardArrowLeft />}
          sx={{ borderRadius: 1 }}
        >
          Back
        </Button>
        {currentStep < 3 && (
          <Button
            variant="contained"
            onClick={handleNext}
            disabled={currentStep === 0 && !isPhoneCurrentlyVerified}
            endIcon={<KeyboardArrowRight />}
            sx={{ borderRadius: 1, fontWeight: 600 }}
          >
            Continue
          </Button>
        )}
      </Box>

      {/* Phone verification modal */}
      {showPhoneModal && (
        <LoginModal
          open={showPhoneModal}
          onClose={() => setShowPhoneModal(false)}
          phoneOnly
          apiBaseUrl={APP_URL}
          // The code picked beside the field (India or Gulf); the dialog sends the OTP to that country.
          dialCode={getCountryConfig(verifyPhoneParts.phoneCountry).phonePrefix}
          phoneLength={getCountryConfig(verifyPhoneParts.phoneCountry).phoneLength}
          initialPhone={verifyPhoneParts.phone}
          onAuthenticated={(verifiedPhoneNumber, fullFromDialog) => {
            setPhoneVerified(true);
            setPhoneVerifiedAt(new Date().toISOString());
            setShowPhoneModal(false);
            if (verifiedPhoneNumber) {
              // The dialog's full number wins: the student may have picked another country there.
              const fullPhone = fullFromDialog
                || (verifiedPhoneNumber.startsWith('+') ? verifiedPhoneNumber : joinEnrolPhone(verifiedPhoneNumber, verifyPhoneParts.phoneCountry));
              setVerifiedPhone(fullPhone);
              setFormData(prev => ({
                ...prev,
                personal: { ...prev.personal, phone: fullPhone, phoneCountry: splitEnrolPhone(fullPhone, verifyPhoneParts.phoneCountry).phoneCountry },
              }));
            }
          }}
        />
      )}
    </Container>
  );
}

// ============================================
// REQUEST REGENERATION DIALOG
// ============================================

function RequestRegenerationDialog({
  open,
  onClose,
  requestName,
  setRequestName,
  requestEmail,
  setRequestEmail,
  requestPhone,
  setRequestPhone,
  onSubmit,
  loading,
  result,
}: {
  open: boolean;
  onClose: () => void;
  requestName: string;
  setRequestName: (v: string) => void;
  requestEmail: string;
  setRequestEmail: (v: string) => void;
  requestPhone: string;
  setRequestPhone: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  result: { ticketNumber: string; message: string } | null;
}) {
  if (result) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
        <DialogTitle>Request Submitted</DialogTitle>
        <DialogContent>
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <CheckCircleOutlined sx={{ fontSize: 48, color: 'success.main', mb: 2 }} />
            <Typography variant="body1" mb={1}>
              {result.message}
            </Typography>
            {result.ticketNumber && (
              <Typography variant="body2" color="text.secondary">
                Reference: <strong>{result.ticketNumber}</strong>
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary" mt={2}>
              The admin will share a new link with you shortly via WhatsApp or email.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} sx={{ borderRadius: 1, textTransform: 'none' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Request New Enrollment Link</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Enter your details and we&apos;ll notify the admin to generate a new link for you.
        </Typography>
        <TextField
          label="Your Name"
          value={requestName}
          onChange={(e) => setRequestName(e.target.value)}
          fullWidth
          required
          size="small"
          sx={{ mb: 2 }}
        />
        <TextField
          label="Email"
          type="email"
          value={requestEmail}
          onChange={(e) => setRequestEmail(e.target.value)}
          fullWidth
          size="small"
          sx={{ mb: 2 }}
        />
        <TextField
          label="Phone Number"
          value={requestPhone}
          onChange={(e) => setRequestPhone(e.target.value)}
          fullWidth
          size="small"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          onClick={onSubmit}
          variant="contained"
          disabled={!requestName || loading}
          sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 600 }}
        >
          {loading ? <CircularProgress size={20} /> : 'Submit Request'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ============================================
// TICKET DIALOG
// ============================================

function TicketDialog({
  open,
  onClose,
  requestName,
  setRequestName,
  requestEmail,
  setRequestEmail,
  requestPhone,
  setRequestPhone,
  ticketDescription,
  setTicketDescription,
  onSubmit,
  loading,
  result,
}: {
  open: boolean;
  onClose: () => void;
  requestName: string;
  setRequestName: (v: string) => void;
  requestEmail: string;
  setRequestEmail: (v: string) => void;
  requestPhone: string;
  setRequestPhone: (v: string) => void;
  ticketDescription: string;
  setTicketDescription: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  result: { ticketNumber: string } | null;
}) {
  if (result?.ticketNumber) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
        <DialogTitle>Ticket Submitted</DialogTitle>
        <DialogContent>
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <CheckCircleOutlined sx={{ fontSize: 48, color: 'success.main', mb: 2 }} />
            <Typography variant="body1" mb={1}>
              Your support ticket has been created.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Ticket ID: <strong>{result.ticketNumber}</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary" mt={2}>
              We&apos;ll get back to you as soon as possible.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} sx={{ borderRadius: 1, textTransform: 'none' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Raise a Support Ticket</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Describe the issue you&apos;re facing and our team will help you.
        </Typography>
        <TextField
          label="Your Name"
          value={requestName}
          onChange={(e) => setRequestName(e.target.value)}
          fullWidth
          required
          size="small"
          sx={{ mb: 2 }}
        />
        <TextField
          label="Email"
          type="email"
          value={requestEmail}
          onChange={(e) => setRequestEmail(e.target.value)}
          fullWidth
          size="small"
          sx={{ mb: 2 }}
        />
        <TextField
          label="Phone Number"
          value={requestPhone}
          onChange={(e) => setRequestPhone(e.target.value)}
          fullWidth
          size="small"
          sx={{ mb: 2 }}
        />
        <TextField
          label="Describe the issue"
          value={ticketDescription}
          onChange={(e) => setTicketDescription(e.target.value)}
          fullWidth
          required
          multiline
          rows={4}
          size="small"
          placeholder="What happened? What were you trying to do?"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          onClick={onSubmit}
          variant="contained"
          disabled={!requestName || !ticketDescription || loading}
          sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 600 }}
        >
          {loading ? <CircularProgress size={20} /> : 'Submit Ticket'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
