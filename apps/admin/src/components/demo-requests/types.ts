import type {
  DemoRequest,
  DemoRequestEvent,
  DemoRequestMessage,
  DemoHost,
  DemoScheduleSettings,
  DemoFollowUpRow,
} from '@neram/database';
import type { DemoEnrolment } from './journey';

export type { DemoRequest, DemoRequestEvent, DemoRequestMessage, DemoHost, DemoScheduleSettings };

export interface DeskKpis {
  newRequests: number;
  today: number;
  confirmedNext7: number;
  /** Open after-demo follow-ups due by the end of today, overdue included. */
  followUpsDue: number;
  attendanceRate30: number | null;
  enrolled30: number;
  requests30: number;
}

export interface DeskSettings {
  /** The demo team. */
  hosts: DemoHost[];
  defaultTutorUpn: string | null;
  defaultOrganizerUpn: string | null;
  schedule: DemoScheduleSettings;
  drawingWhatsApp: string;
}

export interface DeskList {
  requests: DemoRequest[];
  kpis: DeskKpis;
  settings: DeskSettings;
  /** After-demo follow-up per demo request id (attended and no-show only). */
  followUps: Record<string, DemoFollowUpRow>;
  /** Per request id: enrolled after it (fee recorded), or already a student before it. */
  enrolment: Record<string, DemoEnrolment>;
}

export interface DeskDetail {
  request: DemoRequest;
  events: DemoRequestEvent[];
  messages: DemoRequestMessage[];
  actors: Record<string, string>;
  /** The person's open demo follow-up. */
  followUp: DemoFollowUpRow | null;
  /** This demo's newest follow-up, open or closed. */
  lastFollowUp: DemoFollowUpRow | null;
  /** The student's enrolment link (active first), made from any screen. */
  enrolmentLink?: DeskEnrolmentLink | null;
}

export interface DeskEnrolmentLink {
  id: string;
  status: 'active' | 'payment_submitted' | 'used' | 'expired' | 'cancelled';
  expires_at: string;
  created_at: string;
  created_by_name: string | null;
  final_fee: number | string;
  amount_paid: number | string;
  payment_scheme: 'full' | 'installment' | null;
  installment_2_due_date: string | null;
  share_count: number | null;
  last_shared_at: string | null;
  /** student_pays links: the offer snapshot and the last rejection, if any. */
  payment_mode?: 'student_pays' | 'recorded' | null;
  total_fee?: number | string | null;
  discount_amount?: number | string | null;
  offer_full_amount?: number | string | null;
  offer_installment_1?: number | string | null;
  offer_installment_2?: number | string | null;
  rejection_reason?: string | null;
  /** The enrolled student's record (the class account is made for them). */
  user_id?: string | null;
  submitted_user_id?: string | null;
}

export type { DeskStage, DeskPerson } from './journey';
