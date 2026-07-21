/**
 * Assignment bulk-create schema. Teachers paste JSON produced by ChatGPT/Gemini
 * (one object for a single class, or many for a week) into the "Paste from AI"
 * dialog; this validates and normalizes it into an editable review grid before
 * import. Mirrors the Question Bank bulk-upload contract (validate -> review ->
 * import) so the two flows feel the same.
 *
 * Pure and framework-free (no React, no fetch) so it runs in the paste dialog
 * and again server-side in /api/assignments/bulk as a trust boundary.
 */
import { istTodayStr } from './assignment-clock';
import type { AssignmentFormat } from './assignment-format';

export type BulkAssignmentType = 'drawing' | 'document';

/** The AI-facing shape (what a teacher pastes). All fields except title optional. */
export interface BulkAssignmentInput {
  title: string;
  instructions?: string;
  /** 'drawing' (photos-only, smart review) or 'document' (solve a paper). */
  assignment_type?: BulkAssignmentType;
  /** Drawing only: 2d_composition | 3d_composition | kit_sculpture. */
  drawing_category?: string;
  /** Drawing only: reference/expected-output image URL. */
  reference_image_url?: string;
  /** Drawing only: several reference/expected-output image URLs. */
  reference_image_urls?: string[];
  /** Document only: link an existing OneDrive/SharePoint file by share URL. */
  link_url?: string;
  submission_format?: AssignmentFormat;
  max_marks?: number;
  /** Class day the assignment belongs to (YYYY-MM-DD). Defaults to today. */
  class_date?: string;
  /** Absolute due date (YYYY-MM-DD or ISO). Takes precedence over due_offset_days. */
  due_date?: string;
  /** Or a due date N days after class_date. */
  due_offset_days?: number;
  /** Days a late joiner gets from their join date (default 7). */
  catchup_window_days?: number;
  /** Inline image: an http(s) URL or a data: URL (uploaded on import). */
  content_image_url?: string;
  content_image_base64?: string;
  /** Short explainer video for the task itself. */
  content_video_url?: string;
  /** Class recording for late joiners. */
  recording_url?: string;
  recording_source?: 'youtube' | 'sharepoint';
  /** External references (JEE PYQ, docs). */
  links?: { label?: string; url: string }[];
}

/** A normalized, editable row shown in the review grid. */
export interface ReviewAssignment {
  title: string;
  instructions: string;
  assignment_type: BulkAssignmentType;
  drawing_category: string | null;
  reference_image_url: string | null;
  reference_image_urls: string[];
  link_url: string | null;
  submission_format: AssignmentFormat;
  max_marks: number;
  class_date: string;
  due_date: string | null;
  catchup_window_days: number;
  /** May be a data: URL pending upload; the dialog uploads it before import. */
  content_image_url: string | null;
  content_image_is_base64: boolean;
  content_video_url: string | null;
  recording_url: string | null;
  recording_source: 'youtube' | 'sharepoint' | null;
  links: { label: string; url: string }[];
  /** Per-row problems (block import when non-empty). */
  errors: string[];
}

export interface AssignmentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  assignments: ReviewAssignment[];
}

const FORMATS: AssignmentFormat[] = ['pdf', 'image', 'pdf_or_image'];
const DAY_MS = 86_400_000;

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function addDays(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}
function inferRecordingSource(url: string): 'youtube' | 'sharepoint' {
  return /youtube\.com|youtu\.be/i.test(url) ? 'youtube' : 'sharepoint';
}
function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

/** Normalize one raw assignment into a review row, collecting per-row errors. */
function normalizeOne(raw: BulkAssignmentInput, today: string): ReviewAssignment {
  const errors: string[] = [];

  const title = String(raw.title ?? '').trim();
  if (!title) errors.push('Missing title.');

  const assignmentType: BulkAssignmentType = raw.assignment_type === 'drawing' ? 'drawing' : 'document';

  // Drawing tasks are photos-only; ignore any submission_format they sent.
  let format = (raw.submission_format ?? 'pdf_or_image') as AssignmentFormat;
  if (assignmentType === 'drawing') {
    format = 'image';
  } else if (!FORMATS.includes(format)) {
    errors.push(`Unknown submission_format "${raw.submission_format}"; using pdf_or_image.`);
    format = 'pdf_or_image';
  }

  const drawingCategory =
    assignmentType === 'drawing'
      ? ['2d_composition', '3d_composition', 'kit_sculpture'].includes(String(raw.drawing_category))
        ? String(raw.drawing_category)
        : '3d_composition'
      : null;
  const referenceImageUrl =
    assignmentType === 'drawing' && raw.reference_image_url && isHttpUrl(String(raw.reference_image_url))
      ? String(raw.reference_image_url)
      : null;
  // Multiple reference images: the preview grid (and SharePoint links) can add
  // several. Fall back to the single AI-provided reference_image_url. Deduped, capped.
  const referenceImageUrls: string[] = [];
  if (assignmentType === 'drawing') {
    const rawRefs = Array.isArray(raw.reference_image_urls)
      ? raw.reference_image_urls
      : referenceImageUrl
        ? [referenceImageUrl]
        : [];
    const seen = new Set<string>();
    for (const v of rawRefs) {
      const s = String(v || '').trim();
      if (isHttpUrl(s) && !seen.has(s)) {
        seen.add(s);
        referenceImageUrls.push(s);
        if (referenceImageUrls.length >= 6) break;
      }
    }
  }
  const linkUrl =
    assignmentType === 'document' && raw.link_url && isHttpUrl(String(raw.link_url)) ? String(raw.link_url) : null;

  let maxMarks = Number(raw.max_marks ?? 10);
  if (!Number.isFinite(maxMarks) || maxMarks <= 0) {
    errors.push('max_marks must be a positive number; using 10.');
    maxMarks = 10;
  }

  let classDate = String(raw.class_date ?? '').slice(0, 10);
  if (!classDate) classDate = today;
  else if (!isYmd(classDate)) {
    errors.push(`class_date "${raw.class_date}" is not YYYY-MM-DD; using today.`);
    classDate = today;
  }

  let dueDate: string | null = null;
  if (raw.due_date) {
    const d = String(raw.due_date).slice(0, 10);
    if (isYmd(d)) dueDate = d;
    else errors.push(`due_date "${raw.due_date}" is not YYYY-MM-DD; ignored.`);
  } else if (raw.due_offset_days != null && Number.isFinite(Number(raw.due_offset_days))) {
    dueDate = addDays(classDate, Math.max(0, Math.round(Number(raw.due_offset_days))));
  }

  let windowDays = Number(raw.catchup_window_days ?? 7);
  if (!Number.isFinite(windowDays) || windowDays < 0) windowDays = 7;

  // Image: prefer explicit base64, else a URL.
  let contentImageUrl: string | null = null;
  let isBase64 = false;
  if (raw.content_image_base64 && raw.content_image_base64.startsWith('data:')) {
    contentImageUrl = raw.content_image_base64;
    isBase64 = true;
  } else if (raw.content_image_url) {
    const u = String(raw.content_image_url);
    if (u.startsWith('data:')) {
      contentImageUrl = u;
      isBase64 = true;
    } else if (isHttpUrl(u)) {
      contentImageUrl = u;
    } else {
      errors.push('content_image_url is not a valid URL; ignored.');
    }
  }

  let recordingUrl: string | null = null;
  let recordingSource: 'youtube' | 'sharepoint' | null = null;
  if (raw.recording_url && isHttpUrl(String(raw.recording_url))) {
    recordingUrl = String(raw.recording_url);
    recordingSource =
      raw.recording_source === 'youtube' || raw.recording_source === 'sharepoint'
        ? raw.recording_source
        : inferRecordingSource(recordingUrl);
  } else if (raw.recording_url) {
    errors.push('recording_url is not a valid URL; ignored.');
  }

  const links = (Array.isArray(raw.links) ? raw.links : [])
    .filter((l) => l && isHttpUrl(String(l.url)))
    .map((l) => ({ label: String(l.label || l.url).trim(), url: String(l.url).trim() }));

  return {
    title,
    instructions: String(raw.instructions ?? '').trim(),
    assignment_type: assignmentType,
    drawing_category: drawingCategory,
    reference_image_url: referenceImageUrls[0] ?? null,
    reference_image_urls: referenceImageUrls,
    link_url: linkUrl,
    submission_format: format,
    max_marks: maxMarks,
    class_date: classDate,
    due_date: dueDate,
    catchup_window_days: windowDays,
    content_image_url: contentImageUrl,
    content_image_is_base64: isBase64,
    content_video_url: raw.content_video_url && isHttpUrl(String(raw.content_video_url)) ? String(raw.content_video_url) : null,
    recording_url: recordingUrl,
    recording_source: recordingSource,
    links,
    errors,
  };
}

/**
 * Validate + normalize pasted JSON. Accepts either `{ assignments: [...] }` or a
 * bare `[...]` array (AIs return both). Row-level problems are collected on each
 * row; only structural failures (not an object/array, empty) are top-level errors.
 */
export function validateAssignmentJSON(data: unknown): AssignmentValidationResult {
  const today = istTodayStr();
  let rawList: unknown[];

  if (Array.isArray(data)) {
    rawList = data;
  } else if (data && typeof data === 'object' && Array.isArray((data as any).assignments)) {
    rawList = (data as any).assignments;
  } else {
    return {
      valid: false,
      errors: ['Expected an array of assignments, or an object with an "assignments" array.'],
      warnings: [],
      assignments: [],
    };
  }

  if (rawList.length === 0) {
    return { valid: false, errors: ['No assignments found in the JSON.'], warnings: [], assignments: [] };
  }

  const assignments = rawList.map((r) => normalizeOne((r || {}) as BulkAssignmentInput, today));
  const rowErrorCount = assignments.filter((a) => a.errors.some((e) => e.startsWith('Missing'))).length;
  const warnings: string[] = [];
  const softIssues = assignments.reduce((n, a) => n + a.errors.filter((e) => !e.startsWith('Missing')).length, 0);
  if (softIssues) warnings.push(`${softIssues} field(s) were auto-corrected. Review the highlighted rows.`);

  return {
    valid: rowErrorCount === 0,
    errors: rowErrorCount ? [`${rowErrorCount} assignment(s) are missing a title.`] : [],
    warnings,
    assignments,
  };
}

/** A worked example object shown in the dialog and used as the AI's target shape. */
export const ASSIGNMENT_JSON_EXAMPLE = {
  schema_version: '1.0',
  assignments: [
    {
      title: 'Recreate the JEE 2024 3D shape',
      assignment_type: 'drawing',
      instructions:
        'Using pencil on A4, recreate the exact isometric shape from the JEE B.Arch 2024 question paper. Focus on proportion and clean line weight.',
      drawing_category: '3d_composition',
      reference_image_url: 'https://example.com/jee-2024-shape.png',
      max_marks: 10,
      class_date: '2026-07-14',
      due_offset_days: 3,
      catchup_window_days: 7,
    },
    {
      title: 'Solve all maths PYQs (JEE 2023)',
      assignment_type: 'document',
      instructions: 'Solve every maths question from the JEE 2023 paper. Scan your work into a single PDF and upload.',
      submission_format: 'pdf',
      max_marks: 20,
      class_date: '2026-07-14',
      due_offset_days: 5,
      link_url: 'https://neramclasses.sharepoint.com/:b:/s/.../jee-2023.pdf',
    },
  ],
};

/** Copy-paste prompt teachers hand to ChatGPT/Gemini/Claude. */
export const ASSIGNMENT_AI_PROMPT_TEMPLATE = `You are helping a teacher create class assignments for an architecture-entrance coaching app.

Return ONLY valid JSON (no markdown, no commentary) in exactly this shape:

{
  "schema_version": "1.0",
  "assignments": [
    {
      "title": "string (required, short)",
      "assignment_type": "drawing | document",
      "instructions": "string (what the student must do)",
      "drawing_category": "2d_composition | 3d_composition | kit_sculpture (drawing only)",
      "reference_image_url": "https URL to the expected/model drawing (drawing only)",
      "link_url": "https OneDrive/SharePoint share link to an existing paper (document only)",
      "submission_format": "pdf | image | pdf_or_image (document only)",
      "max_marks": number,
      "class_date": "YYYY-MM-DD (the day this was taught)",
      "due_offset_days": number,          // OR "due_date": "YYYY-MM-DD"
      "catchup_window_days": 7,            // days a late joiner gets from their join date
      "content_video_url": "https URL (optional)",
      "recording_url": "https URL to the class recording (optional)",
      "recording_source": "youtube | sharepoint (optional)",
      "links": [{ "label": "string", "url": "https URL" }]
    }
  ]
}

Rules:
- assignment_type: use "drawing" for sketch/drawing tasks (evaluated in the drawing review tool), "document" for solve-a-paper tasks.
- For a "drawing" task, students submit photos; you may add a reference_image_url. submission_format is ignored.
- For a "document" task, set submission_format ("pdf" for solved sets, "image" for photos, "pdf_or_image" for either). If the question paper already lives in OneDrive/SharePoint, put its share link in link_url.
- Put one object per assignment. You may return one, or several for a week.
- Only include fields you have real values for. Omit the rest.

Here is what I want to assign:
<describe your assignment(s) here>`;
