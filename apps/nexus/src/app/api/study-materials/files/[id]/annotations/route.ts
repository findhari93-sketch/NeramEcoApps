import { NextRequest, NextResponse } from 'next/server';
import {
  getFileById,
  getFolderById,
  isFolderVisibleToStudent,
  listAnnotationsForFileAndStudent,
  createAnnotation,
  type NexusStudyAnnotationKind,
  type NexusStudyAnnotationPoint,
} from '@neram/database';
import { getRequestUser, isStaff, getStudentExamSet } from '@/lib/study-materials';

const KINDS: NexusStudyAnnotationKind[] = ['pen', 'highlighter', 'note'];
const MAX_POINTS_PER_STROKE = 2000; // generous cap against a runaway client buffer, not a real limit
const MAX_NOTE_LENGTH = 2000;

function isUnitFraction(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
}

function isValidPoints(points: unknown): points is NexusStudyAnnotationPoint[] {
  return (
    Array.isArray(points) &&
    points.length > 0 &&
    points.length <= MAX_POINTS_PER_STROKE &&
    points.every((p) => p && typeof p === 'object' && isUnitFraction((p as any).x) && isUnitFraction((p as any).y))
  );
}

/**
 * GET /api/study-materials/files/[id]/annotations[?studentId=<id>]
 * Student callers always get their own marks; `studentId` is ignored for them so it can
 * never be used to read a classmate's notes. Staff must pass `studentId` explicitly (this
 * is a personal-notebook feature with no "everyone's marks" view) — see
 * ChapterWorkspaceRail's Students tab for the caller.
 *
 * POST /api/study-materials/files/[id]/annotations
 * Body: { page_number, kind: 'pen'|'highlighter'|'note', color, stroke_width?,
 *         points? ([{x,y}] fractions, required for pen/highlighter),
 *         anchor_x?, anchor_y?, note_text? (required for note) }
 * Students only — annotating is a personal study action, not something staff do on a
 * student's behalf.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    const staff = isStaff(user);

    const requestedStudentId = request.nextUrl.searchParams.get('studentId');
    if (staff && !requestedStudentId) {
      return NextResponse.json({ error: 'studentId is required' }, { status: 400 });
    }
    const studentId = staff ? (requestedStudentId as string) : user.id;

    const file = await getFileById(params.id);
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });

    if (!staff) {
      const folder = await getFolderById(file.folder_id);
      if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
      const examSet = await getStudentExamSet(user.id);
      if (!isFolderVisibleToStudent(folder, examSet, user.student_program)) {
        return NextResponse.json({ error: 'Not available' }, { status: 403 });
      }
    }

    const annotations = await listAnnotationsForFileAndStudent(params.id, studentId);
    return NextResponse.json({ annotations });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load annotations';
    return NextResponse.json({ error: message }, { status: message === 'Not authorized' ? 403 : 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    if (isStaff(user)) {
      return NextResponse.json({ error: 'Only students can add annotations' }, { status: 403 });
    }

    const raw = await request.json();
    const kind = raw?.kind as NexusStudyAnnotationKind;
    if (!KINDS.includes(kind)) {
      return NextResponse.json({ error: 'A valid kind is required' }, { status: 400 });
    }
    const pageNumber = Number(raw?.page_number);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      return NextResponse.json({ error: 'A valid page_number is required' }, { status: 400 });
    }
    const color = typeof raw?.color === 'string' && raw.color ? raw.color : '#FFD54F';
    const noteText =
      typeof raw?.note_text === 'string' ? raw.note_text.trim().slice(0, MAX_NOTE_LENGTH) || null : null;

    let points: NexusStudyAnnotationPoint[] | null = null;
    let anchorX: number | null = null;
    let anchorY: number | null = null;

    if (kind === 'note') {
      if (!isUnitFraction(raw?.anchor_x) || !isUnitFraction(raw?.anchor_y)) {
        return NextResponse.json({ error: 'anchor_x/anchor_y are required for a note' }, { status: 400 });
      }
      if (!noteText) {
        return NextResponse.json({ error: 'note_text is required for a note' }, { status: 400 });
      }
      anchorX = raw.anchor_x;
      anchorY = raw.anchor_y;
    } else {
      if (!isValidPoints(raw?.points)) {
        return NextResponse.json({ error: 'points is required for a pen/highlighter stroke' }, { status: 400 });
      }
      points = raw.points;
    }

    const file = await getFileById(params.id);
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    const folder = await getFolderById(file.folder_id);
    if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    const examSet = await getStudentExamSet(user.id);
    if (!isFolderVisibleToStudent(folder, examSet, user.student_program)) {
      return NextResponse.json({ error: 'Not available' }, { status: 403 });
    }

    const annotation = await createAnnotation({
      file_id: params.id,
      student_id: user.id,
      page_number: pageNumber,
      kind,
      color,
      stroke_width: typeof raw?.stroke_width === 'number' ? raw.stroke_width : null,
      points,
      anchor_x: anchorX,
      anchor_y: anchorY,
      note_text: noteText,
    });

    return NextResponse.json({ annotation }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add annotation';
    return NextResponse.json({ error: message }, { status: message === 'Not authorized' ? 403 : 500 });
  }
}
