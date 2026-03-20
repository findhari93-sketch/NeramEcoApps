/**
 * CSV/JSON parser for bulk solution upload.
 * Parses solution data into structured entries that can be matched
 * to existing questions by NTA question ID or source info.
 */

export interface SolutionEntry {
  match_by: 'nta_question_id' | 'source';
  nta_question_id?: string;
  exam_type?: string;
  year?: number;
  session?: string;
  question_number?: number;
  solution_video_url?: string;
  explanation_brief?: string;
  explanation_detailed?: string;
}

const CSV_HEADERS = [
  'nta_question_id',
  'exam_type',
  'year',
  'session',
  'question_number',
  'solution_video_url',
  'explanation_brief',
  'explanation_detailed',
] as const;

/**
 * Parse a single CSV line, handling quoted fields with commas inside them.
 */
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

/**
 * Parse CSV text into solution entries.
 *
 * Expected CSV headers:
 * nta_question_id,exam_type,year,session,question_number,solution_video_url,explanation_brief,explanation_detailed
 *
 * Rules:
 * - If nta_question_id is provided, match_by = 'nta_question_id'
 * - Otherwise if exam_type + year are provided, match_by = 'source'
 * - Rows with neither identifier are skipped with an error
 * - Whitespace is trimmed from all fields
 * - year and question_number are parsed as numbers
 * - Empty strings become undefined
 */
export function parseCSV(csvText: string): { entries: SolutionEntry[]; errors: string[] } {
  const entries: SolutionEntry[] = [];
  const errors: string[] = [];

  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    errors.push('CSV is empty');
    return { entries, errors };
  }

  // Validate headers
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine).map((h) => h.trim().toLowerCase());

  // Build a column index map
  const colIndex: Record<string, number> = {};
  for (const expected of CSV_HEADERS) {
    const idx = headers.indexOf(expected);
    if (idx !== -1) {
      colIndex[expected] = idx;
    }
  }

  // Must have at least nta_question_id or (exam_type + year) columns
  const hasNtaCol = 'nta_question_id' in colIndex;
  const hasSourceCols = 'exam_type' in colIndex && 'year' in colIndex;
  if (!hasNtaCol && !hasSourceCols) {
    errors.push(
      'CSV must have either "nta_question_id" column or both "exam_type" and "year" columns'
    );
    return { entries, errors };
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const fields = parseCSVLine(lines[i]).map((f) => f.trim());

    const get = (col: string): string | undefined => {
      const idx = colIndex[col];
      if (idx === undefined || idx >= fields.length) return undefined;
      const val = fields[idx].trim();
      return val.length > 0 ? val : undefined;
    };

    const ntaId = get('nta_question_id');
    const examType = get('exam_type');
    const yearStr = get('year');
    const session = get('session');
    const qnStr = get('question_number');
    const videoUrl = get('solution_video_url');
    const briefExpl = get('explanation_brief');
    const detailedExpl = get('explanation_detailed');

    // Determine match_by
    let match_by: 'nta_question_id' | 'source' | null = null;
    if (ntaId) {
      match_by = 'nta_question_id';
    } else if (examType && yearStr) {
      match_by = 'source';
    }

    if (!match_by) {
      errors.push(`Row ${rowNum}: Missing identifier — provide nta_question_id or exam_type + year`);
      continue;
    }

    // Parse numeric fields
    let year: number | undefined;
    if (yearStr) {
      year = parseInt(yearStr, 10);
      if (isNaN(year)) {
        errors.push(`Row ${rowNum}: Invalid year "${yearStr}"`);
        continue;
      }
    }

    let question_number: number | undefined;
    if (qnStr) {
      question_number = parseInt(qnStr, 10);
      if (isNaN(question_number)) {
        errors.push(`Row ${rowNum}: Invalid question_number "${qnStr}"`);
        continue;
      }
    }

    // Must have at least one solution field
    if (!videoUrl && !briefExpl && !detailedExpl) {
      errors.push(`Row ${rowNum}: No solution data provided (need video URL, brief, or detailed explanation)`);
      continue;
    }

    entries.push({
      match_by,
      nta_question_id: ntaId,
      exam_type: examType,
      year,
      session,
      question_number,
      solution_video_url: videoUrl,
      explanation_brief: briefExpl,
      explanation_detailed: detailedExpl,
    });
  }

  return { entries, errors };
}

/**
 * Generate a CSV template with headers and 2 example rows.
 */
export function generateCSVTemplate(): string {
  return (
    'nta_question_id,exam_type,year,session,question_number,solution_video_url,explanation_brief,explanation_detailed\n' +
    ',NATA,2026,1,5,https://youtube.com/watch?v=example,Brief explanation here,Detailed explanation here\n' +
    'NTA123,,,,,,Brief explanation for NTA ID match,\n'
  );
}

/**
 * Parse JSON text (array of solution entry objects) into structured entries.
 */
export function parseJSON(jsonText: string): { entries: SolutionEntry[]; errors: string[] } {
  const entries: SolutionEntry[] = [];
  const errors: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    errors.push('Invalid JSON: could not parse the input');
    return { entries, errors };
  }

  if (!Array.isArray(parsed)) {
    errors.push('JSON must be an array of solution entry objects');
    return { entries, errors };
  }

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    const idx = i + 1;

    if (!item || typeof item !== 'object') {
      errors.push(`Item ${idx}: Not a valid object`);
      continue;
    }

    const obj = item as Record<string, unknown>;

    const ntaId = typeof obj.nta_question_id === 'string' && obj.nta_question_id.trim()
      ? obj.nta_question_id.trim()
      : undefined;
    const examType = typeof obj.exam_type === 'string' && obj.exam_type.trim()
      ? obj.exam_type.trim()
      : undefined;
    const year = typeof obj.year === 'number' ? obj.year : undefined;
    const session = typeof obj.session === 'string' && obj.session.trim()
      ? obj.session.trim()
      : undefined;
    const questionNumber = typeof obj.question_number === 'number' ? obj.question_number : undefined;
    const videoUrl = typeof obj.solution_video_url === 'string' && obj.solution_video_url.trim()
      ? obj.solution_video_url.trim()
      : undefined;
    const brief = typeof obj.explanation_brief === 'string' && obj.explanation_brief.trim()
      ? obj.explanation_brief.trim()
      : undefined;
    const detailed = typeof obj.explanation_detailed === 'string' && obj.explanation_detailed.trim()
      ? obj.explanation_detailed.trim()
      : undefined;

    // Determine match_by
    let match_by: 'nta_question_id' | 'source' | null = null;
    if (ntaId) {
      match_by = 'nta_question_id';
    } else if (examType && year !== undefined) {
      match_by = 'source';
    }

    if (!match_by) {
      errors.push(`Item ${idx}: Missing identifier — provide nta_question_id or exam_type + year`);
      continue;
    }

    if (!videoUrl && !brief && !detailed) {
      errors.push(`Item ${idx}: No solution data provided`);
      continue;
    }

    entries.push({
      match_by,
      nta_question_id: ntaId,
      exam_type: examType,
      year,
      session,
      question_number: questionNumber,
      solution_video_url: videoUrl,
      explanation_brief: brief,
      explanation_detailed: detailed,
    });
  }

  return { entries, errors };
}
