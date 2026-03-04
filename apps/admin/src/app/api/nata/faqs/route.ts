// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listNataFaqs, createNataFaq } from '@neram/database';

// GET /api/nata/faqs - List all NATA FAQs
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || undefined;
    const pageSlug = searchParams.get('page_slug') || undefined;

    const data = await listNataFaqs({ category, pageSlug });
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error listing NATA FAQs:', error);
    return NextResponse.json(
      { error: 'Failed to list NATA FAQs' },
      { status: 500 }
    );
  }
}

// POST /api/nata/faqs - Create a NATA FAQ
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      question, answer, category, page_slug,
      year, display_order, is_active,
    } = body;

    if (!question?.en || !answer?.en) {
      return NextResponse.json(
        { error: 'question.en and answer.en are required' },
        { status: 400 }
      );
    }

    const data = await createNataFaq({
      question: question || {},
      answer: answer || {},
      category: category || 'general',
      page_slug: page_slug || null,
      year: year || new Date().getFullYear(),
      display_order: display_order ?? 0,
      is_active: is_active ?? true,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('Error creating NATA FAQ:', error);
    const msg = error instanceof Error ? error.message : 'Failed to create NATA FAQ';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
