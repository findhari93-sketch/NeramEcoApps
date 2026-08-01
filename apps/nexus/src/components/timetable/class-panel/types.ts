import type { ReactNode } from 'react';
import type { ClassCardData } from '../ClassCard';
import type { ClassPrepSummaryClient } from '../PrepGateCard';
import type {
  ClassPanelRole,
  ClassPanelTabKey,
  ClassPanelVariant,
  ClassState,
  TimeIndicator,
} from './class-state';

export type { ClassPanelRole, ClassPanelTabKey, ClassPanelVariant };

/** A class-attached assignment, trimmed to what the panel shows. */
export interface PanelAssignment {
  id: string;
  title: string;
  assignment_type?: string | null;
  due_at?: string | null;
  instructions?: string | null;
  submission?: { status?: string | null; feedback?: string | null; marks?: number | null } | null;
  /** Grading scale, so a reviewed grade renders as stars or marks. */
  evaluation_type?: 'marks' | 'stars' | null;
  max_marks?: number | null;
  /** Reviewed grade + reaction (drawing assignments carry these directly). */
  drawing_rating?: number | null;
  drawing_marks?: number | null;
  drawing_reaction?: string | null;
  /** How many reminders this student has been sent for this assignment. */
  reminder_count?: number | null;
  /** 'prework' is due before the class; 'homework' is set in it. */
  timing?: 'prework' | 'homework' | null;
  /** This student's pre-class reason, when they have given one. */
  prework_reason_code?: string | null;
}

export interface ClassPanelProps {
  cls: ClassCardData | null;
  /**
   * Overlay only. The docked rail is part of the layout and has no open state:
   * it shows the selection or it shows its empty card.
   */
  open?: boolean;
  onClose?: () => void;
  /**
   * 'drawer' overlays (right at md+, a bottom sheet below); 'docked' renders as
   * a plain column, which is what the planner's right rail is. The caller picks,
   * because only the caller knows which view it is in.
   */
  variant?: ClassPanelVariant;
  /**
   * Parents are deliberately absent: they get ParentClassSheet, for the reasons
   * written at the top of that file.
   */
  role: ClassPanelRole;
  classroomId: string;
  getToken: () => Promise<string | null>;
  /** Teacher-scoped token, needed by the wrap up's AI and YouTube calls. */
  getTeacherToken?: () => Promise<string | null>;
  /** Every toast goes to the host page, which already owns a Snackbar. */
  onNotify: (message: string, severity?: 'success' | 'error' | 'warning') => void;

  rsvpSummary?: { attending: number; total: number } | null;
  /** Real (Teams/manual) attendance for a past class, DB-only so cheap to fetch. */
  attendanceSummary?: {
    present: number;
    total: number;
    /** Follow-up state, from the same request. Absent on older cached shapes. */
    missed?: number;
    explained?: number;
    caughtUp?: number;
  } | null;
  myRsvp?: 'attending' | 'not_attending' | null;
  averageRating?: number | null;
  myAttended?: boolean | null;

  /** Assignments attached to this class, so a student sees the work set in it. */
  assignments?: PanelAssignment[];
  /** Open a specific assignment (student). Omitted for teacher usage. */
  onOpenAssignment?: (assignmentId: string) => void;
  /** Open the pre-class reason sheet for a piece of prework (student). */
  onPreworkReason?: (assignment: PanelAssignment) => void;
  /** Teacher only: show Link / Create / Unlink for this class's assignments. */
  assignmentsEditable?: boolean;
  onLinkAssignment?: (cls: ClassCardData) => void;
  onCreateAssignment?: (cls: ClassCardData) => void;
  /** Opens the prep-test dialog. The page owns it, like the assignment picker. */
  onSetPrepTest?: (cls: ClassCardData) => void;

  /**
   * This class's entry from the `prep` map the student class routes return.
   * Absent means the class was never gated, which is the common case and must
   * behave exactly as it did before the gate existed.
   */
  prep?: ClassPrepSummaryClient | null;
  /** Refetch after a reason is recorded, so the panel reflects the open door. */
  onPrepChanged?: () => void;
  /** Bumped by the page after an outside link or create, to force a reload. */
  refreshKey?: number;

  onEdit?: (cls: ClassCardData) => void;
  onDelete?: (classId: string) => void;
  onDeletePermanent?: (classId: string) => void;
  onRsvp?: (classId: string, response: 'attending' | 'not_attending') => void;
  onRate?: (cls: ClassCardData) => void;
  /** Open the merged register + analytics dialog for this class. */
  onOpenAttendance?: (cls: ClassCardData) => void;
  onSyncRecording?: (cls: ClassCardData) => void;
  onCreateMeeting?: (cls: ClassCardData) => void;
  /** Move this class to another day or time. See RescheduleDialog. */
  onReschedule?: (cls: ClassCardData) => void;
  /** Give a calendar entry to a class that has a join link and no invites. */
  onRepairMeeting?: (cls: ClassCardData) => void;
  onViewRsvpDashboard?: (classId: string) => void;
  /** Something the panel changed needs the host's class list refetched. */
  onChanged?: () => void;
}

/**
 * The bag the shell builds once and spreads into each tab.
 *
 * Same convention as components/catchup/types.ts: one object, built in one
 * place, so a tab cannot quietly acquire its own copy of the truth. Tabs read
 * `state`; only the shell derives it.
 */
export interface ClassPanelTabProps extends Omit<ClassPanelProps, 'cls' | 'open' | 'onClose'> {
  cls: ClassCardData;
  state: ClassState;
  timeIndicator: TimeIndicator | null;
  /** Open the in-app recording player. Owned by the shell. */
  onOpenRecording: () => void;
  /** Open the share sheet. Owned by the shell. */
  onOpenShare: () => void;
  /** Ask for the cancel or the permanent-delete confirmation. */
  onConfirm: (action: 'cancel' | 'delete') => void;
}

/** A small uppercase caption above a block, as the planner rail uses. */
export interface SectionHeadingProps {
  children: ReactNode;
}
