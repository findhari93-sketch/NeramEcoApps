/**
 * Static exam type configuration.
 * Replaces hardcoded getPhaseConfig() in API routes.
 * To add a new exam type, add an entry here. No code changes needed elsewhere.
 */

export interface ExamPhaseConfig {
  phase: string;
  label: string;
  dateRange: string;
  startDate: string;
  endDate: string;
  maxAttempts: number;
  /** Days of week for exam dates: [5, 6] = Fri/Sat. Empty = use start/end as specific dates */
  dayFilter: number[];
}

export interface ExamTypeConfig {
  examType: string;
  label: string;
  year: number;
  status: 'upcoming' | 'in_progress' | 'completed';
  completedMessage?: string;
  phases: ExamPhaseConfig[];
  /** NATA-specific: Phase 2 only for students who missed Phase 1 */
  phase2Rule?: 'only_if_missed_phase1';
}

export const EXAM_CONFIGS: ExamTypeConfig[] = [
  {
    examType: 'nata',
    label: 'NATA',
    year: 2026,
    status: 'in_progress',
    phase2Rule: 'only_if_missed_phase1',
    phases: [
      {
        phase: 'phase_1',
        label: 'Phase 1',
        dateRange: 'Apr - Jun',
        startDate: '2026-04-04',
        endDate: '2026-06-13',
        maxAttempts: 2,
        dayFilter: [5, 6], // Friday and Saturday
      },
      {
        phase: 'phase_2',
        label: 'Phase 2',
        dateRange: 'Aug 7-8',
        startDate: '2026-08-07',
        endDate: '2026-08-08',
        maxAttempts: 1,
        dayFilter: [],
      },
    ],
  },
  {
    examType: 'jee',
    label: 'JEE Paper 2',
    year: 2026,
    status: 'completed',
    completedMessage: 'JEE 2026 exam is over. Updates for JEE 2027 will be available in January.',
    phases: [
      {
        phase: 'session_1',
        label: 'Session 1',
        dateRange: 'Jan',
        startDate: '2026-01-22',
        endDate: '2026-01-31',
        maxAttempts: 1,
        dayFilter: [],
      },
      {
        phase: 'session_2',
        label: 'Session 2',
        dateRange: 'Apr',
        startDate: '2026-04-01',
        endDate: '2026-04-15',
        maxAttempts: 1,
        dayFilter: [],
      },
    ],
  },
];

/** Get config for a specific exam type */
export function getExamConfig(examType: string): ExamTypeConfig | undefined {
  return EXAM_CONFIGS.find((c) => c.examType === examType);
}

/** Get phase config for a specific exam type and phase */
export function getPhaseConfig(examType: string, phase: string): ExamPhaseConfig | undefined {
  return getExamConfig(examType)?.phases.find((p) => p.phase === phase);
}

/** Get all active (non-completed) exam types */
export function getActiveExamTypes(): ExamTypeConfig[] {
  return EXAM_CONFIGS.filter((c) => c.status !== 'completed');
}

/** Generate exam dates for a phase based on its config */
export function generatePhaseDates(phaseConfig: ExamPhaseConfig): string[] {
  if (phaseConfig.dayFilter.length === 0) {
    // Specific dates (Phase 2, JEE sessions)
    const dates: string[] = [];
    const start = new Date(phaseConfig.startDate + 'T00:00:00');
    const end = new Date(phaseConfig.endDate + 'T00:00:00');
    const d = new Date(start);
    while (d <= end) {
      dates.push(formatDate(d));
      d.setDate(d.getDate() + 1);
    }
    return dates;
  }

  // Day-filtered dates (NATA Phase 1: Fri/Sat)
  const start = new Date(phaseConfig.startDate + 'T00:00:00');
  const end = new Date(phaseConfig.endDate + 'T00:00:00');
  const dates: string[] = [];
  const d = new Date(start);
  while (d <= end) {
    if (phaseConfig.dayFilter.includes(d.getDay())) {
      dates.push(formatDate(d));
    }
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
