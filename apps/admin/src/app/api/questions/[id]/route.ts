export const dynamic = 'force-dynamic';

/**
 * Admin API - Direct question edit (bypasses change-request flow)
 *
 * PATCH /api/questions/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminEditQuestion } from '@neram/database';
import type { NataQuestionCategory } from '@neram/database';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Question ID is required' }, { status: 400 });
    }

    const body = await request.json();

    const editableFields = ['title', 'body', 'category', 'exam_year', 'exam_month', 'exam_session', 'confidence_level', 'tags'] as const;
    const hasUpdate = editableFields.some((f) => body[f] !== undefined);
    if (!hasUpdate) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // Validate category if provided
    const validCategories: NataQuestionCategory[] = [
      'mathematics', 'general_aptitude', 'drawing',
      'logical_reasoning', 'aesthetic_sensitivity', 'other',
    ];
    if (body.category && !validCategories.includes(body.category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    // Validate exam_month if provided
    if (body.exam_month != null && (body.exam_month < 1 || body.exam_month > 12)) {
      return NextResponse.json({ error: 'exam_month must be 1-12' }, { status: 400 });
    }

    const question = await adminEditQuestion(id, {
      title: body.title,
      body: body.body,
      category: body.category as NataQuestionCategory | undefined,
      exam_year: body.exam_year,
      exam_month: body.exam_month,
      exam_session: body.exam_session,
      confidence_level: body.confidence_level,
      tags: body.tags,
    });

    return NextResponse.json({ data: question });
  } catch (error: any) {
    console.error('Error editing question:', error);
    return NextResponse.json(
      { error: 'Failed to update question' },
      { status: 500 },
    );
  }
}
