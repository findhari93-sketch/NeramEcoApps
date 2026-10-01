import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import { getQBStudyEditorData, saveQBQuestionStudy } from '@neram/database';
import type { QBStudyConceptInput } from '@neram/database';
import { describeError } from '@/lib/api-errors';

/**
 * "What to study" for one question, staff only.
 *
 * GET: the stored row (reviewed or not) plus the pickers the editor needs:
 * maths chapters, NCERT sections and Foundation sections.
 * PUT: a teacher's version. It is marked reviewed, goes live for students at
 * once, and a changed primary chapter replaces the old one in categories[].
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyQBStaff(request.headers.get('Authorization'));
    if (!auth.ok) return auth.response;
    const { id } = await params;
    return NextResponse.json({ data: await getQBStudyEditorData(id) });
  } catch (err) {
    console.error('[QB API] study GET:', describeError(err));
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyQBStaff(request.headers.get('Authorization'));
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body required' }, { status: 400 });
    }

    const primary = typeof body.primary_slug === 'string' && body.primary_slug.trim() ? body.primary_slug.trim() : null;
    const alsoUses: string[] = Array.isArray(body.also_uses) ? body.also_uses.filter((s: unknown) => typeof s === 'string') : [];
    const concepts: QBStudyConceptInput[] = Array.isArray(body.concepts)
      ? body.concepts
          .filter((c: any) => c && typeof c.name === 'string')
          .map((c: any) => ({
            name: String(c.name).slice(0, 120),
            why: typeof c.why === 'string' ? c.why.slice(0, 300) : null,
            ncert_ref: typeof c.ncert_ref === 'string' ? c.ncert_ref : null,
            foundation_section_id: typeof c.foundation_section_id === 'string' ? c.foundation_section_id : null,
          }))
      : [];

    const row = await saveQBQuestionStudy(id, { primary_slug: primary, also_uses: alsoUses, concepts }, auth.caller.id);
    // The editor reloads so the form's categories follow the primary chapter.
    const data = await getQBStudyEditorData(id);
    return NextResponse.json({ data: { ...data, row } });
  } catch (err) {
    console.error('[QB API] study PUT:', describeError(err));
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to save' }, { status: 500 });
  }
}
