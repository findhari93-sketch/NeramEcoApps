// @ts-nocheck
import { NextResponse } from 'next/server';
import { getWaTemplateById, updateWaTemplate, archiveWaTemplate } from '@neram/database';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params;
    const template = await getWaTemplateById(id);

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json(template);
  } catch (error: any) {
    console.error('Error fetching template:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch template' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, category_id, body: templateBody, sort_order, updated_by } = body;

    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (category_id !== undefined) updates.category_id = category_id;
    if (sort_order !== undefined) updates.sort_order = sort_order;
    if (updated_by !== undefined) updates.updated_by = updated_by;

    if (templateBody !== undefined) {
      updates.body = templateBody;
      // Re-extract placeholders when body changes
      const placeholderRegex = /\{\{(\w+)\}\}/g;
      const matches = [...templateBody.matchAll(placeholderRegex)];
      updates.placeholders = [...new Set(matches.map((m: any) => m[1]))];
    }

    const template = await updateWaTemplate(id, updates);
    return NextResponse.json(template);
  } catch (error: any) {
    console.error('Error updating template:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update template' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    await archiveWaTemplate(id, body.updated_by);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error archiving template:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to archive template' },
      { status: 500 }
    );
  }
}
