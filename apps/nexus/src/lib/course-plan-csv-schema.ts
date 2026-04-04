/**
 * Course Plan CSV Upload — Schema and Types
 *
 * Defines the shape of CSV data for bulk-populating course plan sessions,
 * weeks, tests, drills, and resources from a teacher-filled spreadsheet.
 */

// ============================================================
// Row types for each CSV section
// ============================================================

export interface CSVSessionRow {
  week: number;
  day: number; // day within the week (1-6)
  day_of_week: string; // tue, wed, thu, fri, sat, sun
  slot: string; // am, pm
  title: string;
  teacher: string; // abbreviation like S, Si, H
  homework: string; // homework title/description
  homework_type: string; // drawing, mcq, study, review, mixed
  homework_points: number | null;
  homework_minutes: number | null;
}

export interface CSVWeekRow {
  week: number;
  title: string;
  goal: string;
}

export interface CSVTestRow {
  week: number;
  title: string;
  questions: number;
  duration: number;
  scope: string;
}

export interface CSVDrillRow {
  question: string;
  answer: string;
  explanation: string;
  frequency: string;
}

export interface CSVResourceRow {
  title: string;
  url: string;
  type: string; // video, practice, reference, tool
}

// ============================================================
// Teacher mapping (abbreviation → user)
// ============================================================

export interface TeacherMapping {
  abbreviation: string;
  name: string;
  user_id: string;
}

// ============================================================
// Validation types
// ============================================================

export interface CSVValidationError {
  section: string;
  row: number;
  column?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface CoursePlanCSVData {
  sessions: CSVSessionRow[];
  weeks: CSVWeekRow[];
  tests: CSVTestRow[];
  drills: CSVDrillRow[];
  resources: CSVResourceRow[];
}

export interface CSVValidationResult {
  valid: boolean;
  errors: CSVValidationError[];
  warnings: CSVValidationError[];
  data: CoursePlanCSVData;
}

// ============================================================
// Plan configuration (from the plan record)
// ============================================================

export interface PlanConfig {
  duration_weeks: number;
  days_per_week: string[];
  sessions_per_day: Array<{ slot: string; start: string; end: string }>;
}

// ============================================================
// Validation constants
// ============================================================

export const VALID_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const VALID_SLOTS = ['am', 'pm'];
export const VALID_HOMEWORK_TYPES = ['drawing', 'mcq', 'study', 'review', 'mixed'];
export const VALID_RESOURCE_TYPES = ['video', 'practice', 'reference', 'tool'];
export const SECTION_MARKERS = [
  '---SESSIONS---',
  '---WEEKS---',
  '---TESTS---',
  '---DRILLS---',
  '---RESOURCES---',
];
