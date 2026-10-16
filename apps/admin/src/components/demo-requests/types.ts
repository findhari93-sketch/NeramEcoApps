import type {
  DemoRequest,
  DemoRequestEvent,
  DemoRequestMessage,
  DemoHost,
  DemoScheduleSettings,
  DemoFollowUpRow,
} from '@neram/database';

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
  /** student_profiles.enrollment_date per user id. */
  joinedAt: Record<string, string>;
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
}

export type { DeskStage, DeskPerson } from './journey';
