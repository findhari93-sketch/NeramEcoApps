import type {
  User,
  LeadProfile,
  StudentProfile,
  Payment,
  ScholarshipApplication,
  PaymentInstallment,
  AreaOfInterest,
  Gender,
} from '@neram/database';

export interface FullProfileData {
  user: User;
  leadProfile: LeadProfile | null;
  studentProfile: StudentProfile | null;
  payments: Payment[];
  scholarshipApplication: ScholarshipApplication | null;
  installments: PaymentInstallment[];
  courseName: string | null;
  batchName: string | null;
  centerName: string | null;
  centerCity: string | null;
}

export interface PersonalInfoFormData {
  first_name: string;
  last_name: string;
  nickname: string;
  description: string;
  area_of_interest: AreaOfInterest[];
  date_of_birth: string;
  gender: Gender | '';
}
