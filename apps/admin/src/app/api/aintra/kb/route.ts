// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listAintraKnowledgeBase, createAintraKnowledgeBaseItem } from '@neram/database';

// GET /api/aintra/kb - List all Aintra KB items
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || undefined;

    const data = await listAintraKnowledgeBase({ category });
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error listing Aintra KB:', error);
    return NextResponse.json({ error: 'Failed to list Aintra KB' }, { status: 500 });
  }
}

// POST /api/aintra/kb - Create a new KB item
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question, answer, category, display_order, is_active } = body;

    if (!question?.trim() || !answer?.trim()) {
      return NextResponse.json(
        { error: 'question and answer are required' },
        { status: 400 }
      );
    }

    const data = await createAintraKnowledgeBaseItem({
      question: question.trim(),
      answer: answer.trim(),
      category: category || 'General',
      display_order: display_order ?? 0,
      is_active: is_active ?? true,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('Error creating Aintra KB item:', error);
    const msg = error instanceof Error ? error.message : 'Failed to create KB item';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
