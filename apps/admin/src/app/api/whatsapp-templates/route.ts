// @ts-nocheck
import { NextResponse } from 'next/server';
import { getWaCategories, getAllWaTemplates, createWaTemplate } from '@neram/database';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [categories, templates] = await Promise.all([
      getWaCategories(),
      getAllWaTemplates(),
    ]);

    return NextResponse.json({ categories, templates });
  } catch (error: any) {
    console.error('Error fetching WhatsApp templates:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, category_id, body: templateBody, sort_order, created_by } = body;

    if (!title || !category_id || !templateBody) {
      return NextResponse.json(
        { error: 'Title, category, and body are required' },
        { status: 400 }
      );
    }

    // Auto-extract placeholders from body
    const placeholderRegex = /\{\{(\w+)\}\}/g;
    const matches = [...templateBody.matchAll(placeholderRegex)];
    const placeholders = [...new Set(matches.map((m: any) => m[1]))];

    const template = await createWaTemplate({
      title,
      category_id,
      body: templateBody,
      placeholders,
      sort_order: sort_order || 0,
      created_by: created_by || 'admin',
      updated_by: created_by || 'admin',
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error: any) {
    console.error('Error creating WhatsApp template:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create template' },
      { status: 500 }
    );
  }
}
