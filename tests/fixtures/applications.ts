/**
 * Application Test Fixtures
 *
 * Pre-defined application data for testing the marketing application form lifecycle.
 * Matches the CreateApplicationInput schema used by POST /api/application.
 */

export const mockSchoolStudentApplication = {
  firstName: 'E2E Lifecycle Student',
  fatherName: 'E2E Lifecycle Father',
  phone: '9000000099',
  phoneVerified: true,
  phoneVerifiedAt: new Date().toISOString(),
  country: 'IN',
  state: 'Tamil Nadu',
  city: 'Chennai',
  district: 'Chennai',
  pincode: '600001',
  applicantCategory: 'school_student' as const,
  academicData: {
    school_name: 'E2E Test School',
    current_class: '12',
    board: 'CBSE',
    stream: 'Science',
  },
  casteCategory: 'general' as const,
  targetExamYear: 2027,
  interestCourse: 'nata' as const,
  learningMode: 'hybrid' as const,
  status: 'submitted' as const,
};

export const mockCollegeStudentApplication = {
  firstName: 'E2E College Student',
  fatherName: 'E2E College Father',
  phone: '9000000098',
  phoneVerified: true,
  phoneVerifiedAt: new Date().toISOString(),
  country: 'IN',
  state: 'Karnataka',
  city: 'Bangalore',
  district: 'Bangalore Urban',
  pincode: '560001',
  applicantCategory: 'college_student' as const,
  academicData: {
    college_name: 'E2E Test College',
    degree: 'B.Arch',
    year_of_study: '2',
    university: 'VTU',
  },
  casteCategory: 'obc' as const,
  targetExamYear: 2027,
  interestCourse: 'jee_paper2' as const,
  learningMode: 'online_only' as const,
  status: 'submitted' as const,
};

export const mockWorkingProfessionalApplication = {
  firstName: 'E2E Working Professional',
  fatherName: 'E2E WP Father',
  phone: '9000000097',
  phoneVerified: true,
  phoneVerifiedAt: new Date().toISOString(),
  country: 'IN',
  state: 'Maharashtra',
  city: 'Mumbai',
  district: 'Mumbai',
  pincode: '400001',
  applicantCategory: 'working_professional' as const,
  academicData: {
    company: 'E2E Test Corp',
    designation: 'Software Engineer',
    years_of_experience: '3',
  },
  casteCategory: 'general' as const,
  targetExamYear: 2027,
  interestCourse: 'both' as const,
  learningMode: 'hybrid' as const,
  status: 'submitted' as const,
};

/** Minimal application — only required fields, for edge case testing */
export const mockMinimalApplication = {
  firstName: 'E2E Minimal Student',
  phone: '9000000096',
  phoneVerified: true,
  phoneVerifiedAt: new Date().toISOString(),
  country: 'IN',
  interestCourse: 'not_sure' as const,
  status: 'draft' as const,
};

/** Application payload for creating a test lead via admin POST /api/leads */
export const mockTestLeadPayload = {
  name: 'E2E Lifecycle Test Student',
  email: 'e2e-lifecycle@example.com',
  phone: '9000000099',
  course: 'nata',
  city: 'Chennai',
  state: 'Tamil Nadu',
  source: 'manual',
};

/** Fee data for admin approval */
export const mockApprovalFeeData = {
  assignedFee: 30000,
  discountAmount: 5000,
  finalFee: 25000,
  paymentScheme: 'full',
  fullPaymentDiscount: 2000,
  paymentRecommendation: 'Full payment recommended for early bird discount',
};

/** Installment fee data for admin approval */
export const mockInstallmentFeeData = {
  assignedFee: 30000,
  discountAmount: 5000,
  finalFee: 25000,
  paymentScheme: 'installment',
  installment1Amount: 14000,
  installment2Amount: 11000,
  installment2DueDays: 30,
};
