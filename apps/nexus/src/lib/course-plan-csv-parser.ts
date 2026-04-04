/**
 * Course Plan CSV Parser
 *
 * Two exports:
 *  - generateCSVTemplate()  — creates a CSV template string for teachers to fill
 *  - parseCoursePlanCSV()   — parses filled CSV text and validates all fields
 *
 * CSV format uses section markers (---SESSIONS---, ---WEEKS---, etc.)
 * and comment lines starting with #.
 */

import type {
  CSVSessionRow,
  CSVWeekRow,
  CSVTestRow,
  CSVDrillRow,
  CSVResourceRow,
  CSVValidationError,
  CSVValidationResult,
  CoursePlanCSVData,
  TeacherMapping,
  PlanConfig,
} from './course-plan-csv-schema';
import {
  VALID_DAYS,
  VALID_SLOTS,
  VALID_HOMEWORK_TYPES,
  VALID_RESOURCE_TYPES,
  SECTION_MARKERS,
} from './course-plan-csv-schema';

// ============================================================
// parseCSVLine — handles quoted fields with commas inside them
// (copied from solution-csv-parser.ts)
// ============================================================

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ""
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

// ============================================================
// generateCSVTemplate
// ============================================================

/**
 * Generate a downloadable CSV template pre-filled with session slots
 * for the given plan configuration.
 */
export function generateCSVTemplate(
  plan: {
    name: string;
    duration_weeks: number;
    days_per_week: string[];
    sessions_per_day: Array<{ slot: string; label?: string }>;
    teaching_team?: Array<{ user_id: string; name: string; role?: string }>;
  },
  teachers: TeacherMapping[]
): string {
  const lines: string[] = [];

  // Comment header
  lines.push(`# Course Plan CSV Template`);
  lines.push(`# Plan: ${plan.name}`);
  lines.push(`# Weeks: ${plan.duration_weeks}, Days/week: ${plan.days_per_week.join(', ')}, Slots/day: ${plan.sessions_per_day.map((s) => s.slot).join(', ')}`);
  lines.push(`#`);
  lines.push(`# Teacher abbreviations:`);
  for (const t of teachers) {
    lines.push(`#   ${t.abbreviation} = ${t.name}`);
  }
  lines.push(`#`);
  lines.push(`# Instructions:`);
  lines.push(`#   1. Fill in the title, teacher, and homework columns for each session`);
  lines.push(`#   2. Add week titles and goals in the WEEKS section`);
  lines.push(`#   3. Optionally add tests, drills, and resources in their sections`);
  lines.push(`#   4. Lines starting with # are comments and will be ignored`);
  lines.push(`#   5. Do not change the ---SECTION--- markers`);
  lines.push(`#`);

  // ---SESSIONS--- section
  lines.push('---SESSIONS---');
  lines.push('week,day,day_of_week,slot,title,teacher,homework,homework_type,homework_points,homework_minutes');

  let globalDay = 0;
  for (let w = 1; w <= plan.duration_weeks; w++) {
    for (let d = 0; d < plan.days_per_week.length; d++) {
      globalDay++;
      const dayOfWeek = plan.days_per_week[d];
      for (const sessionDef of plan.sessions_per_day) {
        lines.push(`${w},${d + 1},${dayOfWeek},${sessionDef.slot},,,,,,`);
      }
    }
  }

  // ---WEEKS--- section
  lines.push('');
  lines.push('---WEEKS---');
  lines.push('week,title,goal');
  for (let w = 1; w <= plan.duration_weeks; w++) {
    lines.push(`${w},,`);
  }

  // ---TESTS--- section
  lines.push('');
  lines.push('---TESTS---');
  lines.push('week,title,questions,duration,scope');
  lines.push('# Example: 2,Weekly Test 2,30,60,Weeks 1-2 topics');

  // ---DRILLS--- section
  lines.push('');
  lines.push('---DRILLS---');
  lines.push('question,answer,explanation,frequency');
  lines.push('# Example: "What is the golden ratio?","1.618","Phi = (1+sqrt(5))/2",daily');

  // ---RESOURCES--- section
  lines.push('');
  lines.push('---RESOURCES---');
  lines.push('title,url,type');
  lines.push('# Example: "Perspective Drawing Basics","https://youtube.com/watch?v=abc",video');

  return lines.join('\n');
}

// ============================================================
// parseCoursePlanCSV
// ============================================================

/**
 * Parse a filled CSV template and validate all fields.
 */
export function parseCoursePlanCSV(
  text: string,
  teacherMappings: TeacherMapping[],
  planConfig: PlanConfig
): CSVValidationResult {
  const errors: CSVValidationError[] = [];
  const warnings: CSVValidationError[] = [];
  const data: CoursePlanCSVData = {
    sessions: [],
    weeks: [],
    tests: [],
    drills: [],
    resources: [],
  };

  // Normalise line endings and split
  const allLines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n');

  // Split lines into sections by markers
  const sections: Record<string, string[]> = {};
  let currentSection: string | null = null;

  for (const rawLine of allLines) {
    const trimmed = rawLine.trim();

    // Check for section marker
    if (SECTION_MARKERS.includes(trimmed)) {
      currentSection = trimmed;
      sections[currentSection] = [];
      continue;
    }

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Accumulate lines into current section
    if (currentSection) {
      sections[currentSection].push(rawLine);
    }
  }

  // Build teacher abbreviation lookup (case-insensitive)
  const teacherMap = new Map<string, TeacherMapping>();
  for (const t of teacherMappings) {
    teacherMap.set(t.abbreviation.toLowerCase(), t);
  }

  // Parse each section
  if (sections['---SESSIONS---']) {
    parseSessions(sections['---SESSIONS---'], data, errors, warnings, teacherMap, planConfig);
  }
  if (sections['---WEEKS---']) {
    parseWeeks(sections['---WEEKS---'], data, errors, warnings, planConfig);
  }
  if (sections['---TESTS---']) {
    parseTests(sections['---TESTS---'], data, errors, warnings, planConfig);
  }
  if (sections['---DRILLS---']) {
    parseDrills(sections['---DRILLS---'], data, errors, warnings);
  }
  if (sections['---RESOURCES---']) {
    parseResources(sections['---RESOURCES---'], data, errors, warnings);
  }

  // Cross-validation: weeks referenced in sessions should match plan
  const sessionWeeks = new Set(data.sessions.map((s) => s.week));
  for (const w of sessionWeeks) {
    if (w < 1 || w > planConfig.duration_weeks) {
      errors.push({
        section: 'SESSIONS',
        row: 0,
        message: `Week ${w} referenced in sessions is outside the plan range (1-${planConfig.duration_weeks})`,
        severity: 'error',
      });
    }
  }

  // Cross-validation: day_of_week must be in plan's days_per_week
  for (let i = 0; i < data.sessions.length; i++) {
    const s = data.sessions[i];
    if (!planConfig.days_per_week.includes(s.day_of_week)) {
      warnings.push({
        section: 'SESSIONS',
        row: i + 2, // +1 for header, +1 for 1-based
        column: 'day_of_week',
        message: `"${s.day_of_week}" is not in the plan's configured days (${planConfig.days_per_week.join(', ')})`,
        severity: 'warning',
      });
    }
  }

  // Cross-validation: tests referencing weeks outside plan range
  for (let i = 0; i < data.tests.length; i++) {
    const t = data.tests[i];
    if (t.week < 1 || t.week > planConfig.duration_weeks) {
      errors.push({
        section: 'TESTS',
        row: i + 2,
        column: 'week',
        message: `Week ${t.week} is outside the plan range (1-${planConfig.duration_weeks})`,
        severity: 'error',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    data,
  };
}

// ============================================================
// Section parsers
// ============================================================

function buildColumnIndex(headerLine: string, expectedHeaders: string[]): Record<string, number> {
  const headers = parseCSVLine(headerLine).map((h) => h.trim().toLowerCase());
  const idx: Record<string, number> = {};
  for (const h of expectedHeaders) {
    const pos = headers.indexOf(h);
    if (pos !== -1) {
      idx[h] = pos;
    }
  }
  return idx;
}

function getField(fields: string[], colIndex: Record<string, number>, col: string): string {
  const idx = colIndex[col];
  if (idx === undefined || idx >= fields.length) return '';
  return fields[idx].trim();
}

// ---SESSIONS---

function parseSessions(
  lines: string[],
  data: CoursePlanCSVData,
  errors: CSVValidationError[],
  warnings: CSVValidationError[],
  teacherMap: Map<string, TeacherMapping>,
  planConfig: PlanConfig
) {
  if (lines.length === 0) return;

  const expectedHeaders = [
    'week', 'day', 'day_of_week', 'slot', 'title', 'teacher',
    'homework', 'homework_type', 'homework_points', 'homework_minutes',
  ];
  const colIndex = buildColumnIndex(lines[0], expectedHeaders);

  // Require key columns
  for (const required of ['week', 'day', 'day_of_week', 'slot']) {
    if (!(required in colIndex)) {
      errors.push({
        section: 'SESSIONS',
        row: 1,
        column: required,
        message: `Missing required column "${required}" in SESSIONS header`,
        severity: 'error',
      });
      return;
    }
  }

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1; // 1-based, accounting for header
    const fields = parseCSVLine(lines[i]).map((f) => f.trim());
    const get = (col: string) => getField(fields, colIndex, col);

    // Parse week
    const weekStr = get('week');
    const week = parseInt(weekStr, 10);
    if (!weekStr || isNaN(week)) {
      errors.push({ section: 'SESSIONS', row: rowNum, column: 'week', message: `Invalid week "${weekStr}"`, severity: 'error' });
      continue;
    }

    // Parse day
    const dayStr = get('day');
    const day = parseInt(dayStr, 10);
    if (!dayStr || isNaN(day)) {
      errors.push({ section: 'SESSIONS', row: rowNum, column: 'day', message: `Invalid day "${dayStr}"`, severity: 'error' });
      continue;
    }

    // day_of_week
    const dayOfWeek = get('day_of_week').toLowerCase();
    if (!VALID_DAYS.includes(dayOfWeek)) {
      errors.push({ section: 'SESSIONS', row: rowNum, column: 'day_of_week', message: `Invalid day_of_week "${dayOfWeek}". Must be one of: ${VALID_DAYS.join(', ')}`, severity: 'error' });
      continue;
    }

    // slot
    const slot = get('slot').toLowerCase();
    if (!VALID_SLOTS.includes(slot)) {
      errors.push({ section: 'SESSIONS', row: rowNum, column: 'slot', message: `Invalid slot "${slot}". Must be one of: ${VALID_SLOTS.join(', ')}`, severity: 'error' });
      continue;
    }

    // title (optional — may be blank in template)
    const title = get('title');

    // teacher abbreviation
    const teacherAbbr = get('teacher');
    if (teacherAbbr && !teacherMap.has(teacherAbbr.toLowerCase())) {
      warnings.push({
        section: 'SESSIONS',
        row: rowNum,
        column: 'teacher',
        message: `Unknown teacher abbreviation "${teacherAbbr}". Known: ${Array.from(teacherMap.keys()).join(', ')}`,
        severity: 'warning',
      });
    }

    // homework fields
    const homework = get('homework');
    const homeworkType = get('homework_type').toLowerCase();
    if (homeworkType && !VALID_HOMEWORK_TYPES.includes(homeworkType)) {
      warnings.push({
        section: 'SESSIONS',
        row: rowNum,
        column: 'homework_type',
        message: `Invalid homework_type "${homeworkType}". Must be one of: ${VALID_HOMEWORK_TYPES.join(', ')}`,
        severity: 'warning',
      });
    }

    const hwPointsStr = get('homework_points');
    let homeworkPoints: number | null = null;
    if (hwPointsStr) {
      homeworkPoints = parseInt(hwPointsStr, 10);
      if (isNaN(homeworkPoints)) {
        warnings.push({ section: 'SESSIONS', row: rowNum, column: 'homework_points', message: `Invalid homework_points "${hwPointsStr}"`, severity: 'warning' });
        homeworkPoints = null;
      }
    }

    const hwMinStr = get('homework_minutes');
    let homeworkMinutes: number | null = null;
    if (hwMinStr) {
      homeworkMinutes = parseInt(hwMinStr, 10);
      if (isNaN(homeworkMinutes)) {
        warnings.push({ section: 'SESSIONS', row: rowNum, column: 'homework_minutes', message: `Invalid homework_minutes "${hwMinStr}"`, severity: 'warning' });
        homeworkMinutes = null;
      }
    }

    // Skip entirely blank rows (only structural columns filled)
    if (!title && !teacherAbbr && !homework) {
      continue;
    }

    data.sessions.push({
      week,
      day,
      day_of_week: dayOfWeek,
      slot,
      title,
      teacher: teacherAbbr,
      homework,
      homework_type: homeworkType || 'mixed',
      homework_points: homeworkPoints,
      homework_minutes: homeworkMinutes,
    });
  }
}

// ---WEEKS---

function parseWeeks(
  lines: string[],
  data: CoursePlanCSVData,
  errors: CSVValidationError[],
  warnings: CSVValidationError[],
  planConfig: PlanConfig
) {
  if (lines.length === 0) return;

  const colIndex = buildColumnIndex(lines[0], ['week', 'title', 'goal']);

  if (!('week' in colIndex)) {
    errors.push({ section: 'WEEKS', row: 1, column: 'week', message: 'Missing required column "week"', severity: 'error' });
    return;
  }

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const fields = parseCSVLine(lines[i]).map((f) => f.trim());
    const get = (col: string) => getField(fields, colIndex, col);

    const weekStr = get('week');
    const week = parseInt(weekStr, 10);
    if (!weekStr || isNaN(week)) {
      errors.push({ section: 'WEEKS', row: rowNum, column: 'week', message: `Invalid week "${weekStr}"`, severity: 'error' });
      continue;
    }

    const title = get('title');
    const goal = get('goal');

    // Skip blank rows
    if (!title && !goal) continue;

    data.weeks.push({ week, title, goal });
  }
}

// ---TESTS---

function parseTests(
  lines: string[],
  data: CoursePlanCSVData,
  errors: CSVValidationError[],
  warnings: CSVValidationError[],
  planConfig: PlanConfig
) {
  if (lines.length === 0) return;

  const colIndex = buildColumnIndex(lines[0], ['week', 'title', 'questions', 'duration', 'scope']);

  if (!('week' in colIndex) || !('title' in colIndex)) {
    errors.push({ section: 'TESTS', row: 1, message: 'Missing required columns "week" and "title"', severity: 'error' });
    return;
  }

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const fields = parseCSVLine(lines[i]).map((f) => f.trim());
    const get = (col: string) => getField(fields, colIndex, col);

    const weekStr = get('week');
    const week = parseInt(weekStr, 10);
    if (!weekStr || isNaN(week)) {
      errors.push({ section: 'TESTS', row: rowNum, column: 'week', message: `Invalid week "${weekStr}"`, severity: 'error' });
      continue;
    }

    const title = get('title');
    if (!title) {
      warnings.push({ section: 'TESTS', row: rowNum, column: 'title', message: 'Test title is empty', severity: 'warning' });
      continue;
    }

    const questionsStr = get('questions');
    let questions = 0;
    if (questionsStr) {
      questions = parseInt(questionsStr, 10);
      if (isNaN(questions)) {
        warnings.push({ section: 'TESTS', row: rowNum, column: 'questions', message: `Invalid questions count "${questionsStr}"`, severity: 'warning' });
        questions = 0;
      }
    }

    const durationStr = get('duration');
    let duration = 0;
    if (durationStr) {
      duration = parseInt(durationStr, 10);
      if (isNaN(duration)) {
        warnings.push({ section: 'TESTS', row: rowNum, column: 'duration', message: `Invalid duration "${durationStr}"`, severity: 'warning' });
        duration = 0;
      }
    }

    const scope = get('scope');

    data.tests.push({ week, title, questions, duration, scope });
  }
}

// ---DRILLS---

function parseDrills(
  lines: string[],
  data: CoursePlanCSVData,
  errors: CSVValidationError[],
  warnings: CSVValidationError[]
) {
  if (lines.length === 0) return;

  const colIndex = buildColumnIndex(lines[0], ['question', 'answer', 'explanation', 'frequency']);

  if (!('question' in colIndex) || !('answer' in colIndex)) {
    errors.push({ section: 'DRILLS', row: 1, message: 'Missing required columns "question" and "answer"', severity: 'error' });
    return;
  }

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const fields = parseCSVLine(lines[i]).map((f) => f.trim());
    const get = (col: string) => getField(fields, colIndex, col);

    const question = get('question');
    const answer = get('answer');
    if (!question || !answer) {
      if (question || answer) {
        warnings.push({ section: 'DRILLS', row: rowNum, message: 'Drill row missing question or answer — skipped', severity: 'warning' });
      }
      continue;
    }

    data.drills.push({
      question,
      answer,
      explanation: get('explanation'),
      frequency: get('frequency'),
    });
  }
}

// ---RESOURCES---

function parseResources(
  lines: string[],
  data: CoursePlanCSVData,
  errors: CSVValidationError[],
  warnings: CSVValidationError[]
) {
  if (lines.length === 0) return;

  const colIndex = buildColumnIndex(lines[0], ['title', 'url', 'type']);

  if (!('title' in colIndex) || !('url' in colIndex)) {
    errors.push({ section: 'RESOURCES', row: 1, message: 'Missing required columns "title" and "url"', severity: 'error' });
    return;
  }

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const fields = parseCSVLine(lines[i]).map((f) => f.trim());
    const get = (col: string) => getField(fields, colIndex, col);

    const title = get('title');
    const url = get('url');
    if (!title || !url) {
      if (title || url) {
        warnings.push({ section: 'RESOURCES', row: rowNum, message: 'Resource row missing title or url — skipped', severity: 'warning' });
      }
      continue;
    }

    const type = get('type').toLowerCase() || 'reference';
    if (!VALID_RESOURCE_TYPES.includes(type)) {
      warnings.push({
        section: 'RESOURCES',
        row: rowNum,
        column: 'type',
        message: `Invalid resource type "${type}". Must be one of: ${VALID_RESOURCE_TYPES.join(', ')}`,
        severity: 'warning',
      });
    }

    data.resources.push({ title, url, type });
  }
}
