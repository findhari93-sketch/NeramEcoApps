export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  updateStudentResult,
  deleteStudentResult,
  generateStudentResultSlug,
} from '@neram/database';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/student-results/[id]
 *
 * Fetch a single student result by ID (includes unpublished).
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const client = getSupabaseAdminClient();

    const { data, error } = await client
      .from('student_results')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Student result not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error fetching student result:', error);
    return NextResponse.json(
      { error: 'Failed to fetch student result' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/student-results/[id]
 *
 * Update a student result. Re-generates slug if name, exam_type, or year changed.
 */
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const client = getSupabaseAdminClient();

    // Fetch current record to detect slug-affecting changes
    const { data: current, error: fetchError } = await client
      .from('student_results')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !current) {
      return NextResponse.json(
        { error: 'Student result not found' },
        { status: 404 }
      );
    }

    const updates = { ...body };

    // Re-generate slug if name, exam_type, or exam_year changed
    const nameChanged = body.student_name && body.student_name !== current.student_name;
    const examChanged = body.exam_type && body.exam_type !== current.exam_type;
    const yearChanged = body.exam_year && body.exam_year !== current.exam_year;

    if (nameChanged || examChanged || yearChanged) {
      const newName = body.student_name || current.student_name;
      const newExam = body.exam_type || current.exam_type;
      const newYear = body.exam_year || current.exam_year;

      let baseSlug = generateStudentResultSlug(newName, newExam, newYear);
      let slug = baseSlug;
      let suffix = 1;

      while (true) {
        const { data: existing } = await client
          .from('student_results')
          .select('id')
          .eq('slug', slug)
          .neq('id', id)
          .limit(1);

        if (!existing || existing.length === 0) {
          break;
        }
        suffix++;
        slug = `${baseSlug}-${suffix}`;
      }

      updates.slug = slug;
    }

    // Parse numeric fields if provided as strings
    if (updates.score != null) updates.score = parseFloat(String(updates.score));
    if (updates.max_score != null) updates.max_score = parseFloat(String(updates.max_score));
    if (updates.rank != null) updates.rank = parseInt(String(updates.rank), 10);
    if (updates.percentile != null) updates.percentile = parseFloat(String(updates.percentile));
    if (updates.exam_year != null) updates.exam_year = parseInt(String(updates.exam_year), 10);

    // Remove fields that should not be directly updated
    delete updates.id;
    delete updates.created_at;
    delete updates.updated_at;

    const result = await updateStudentResult(id, updates, client);

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to update student result' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('Error updating student result:', error);
    return NextResponse.json(
      { error: 'Failed to update student result' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/student-results/[id]
 *
 * Delete a student result and its associated storage files.
 */
export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const client = getSupabaseAdminClient();

    // Fetch the record to get file paths for cleanup
    const { data: record, error: fetchError } = await client
      .from('student_results')
      .select('photo_url, scorecard_url, scorecard_watermarked_url')
      .eq('id', id)
      .single();

    if (fetchError || !record) {
      return NextResponse.json(
        { error: 'Student result not found' },
        { status: 404 }
      );
    }

    // Delete associated storage files (best effort, don't fail if cleanup fails)
    await cleanupStorageFile(client, 'student-results-photos', record.photo_url);
    await cleanupStorageFile(client, 'student-results-originals', record.scorecard_url);
    await cleanupStorageFile(client, 'student-results-watermarked', record.scorecard_watermarked_url);

    // Delete the database record
    const success = await deleteStudentResult(id, client);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to delete student result' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting student result:', error);
    return NextResponse.json(
      { error: 'Failed to delete student result' },
      { status: 500 }
    );
  }
}

/**
 * Extract the file path from a Supabase storage URL and delete the file.
 * Handles both public URLs and signed URLs.
 */
async function cleanupStorageFile(
  client: ReturnType<typeof getSupabaseAdminClient>,
  bucket: string,
  url: string | null
) {
  if (!url) return;

  try {
    // Public URL format: .../storage/v1/object/public/<bucket>/<path>
    // Signed URL format: .../storage/v1/object/sign/<bucket>/<path>?token=...
    const patterns = [
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/sign/${bucket}/`,
    ];

    let filePath: string | null = null;

    for (const pattern of patterns) {
      const idx = url.indexOf(pattern);
      if (idx !== -1) {
        filePath = url.substring(idx + pattern.length);
        // Remove query params (for signed URLs)
        const queryIdx = filePath.indexOf('?');
        if (queryIdx !== -1) {
          filePath = filePath.substring(0, queryIdx);
        }
        break;
      }
    }

    if (filePath) {
      const decoded = decodeURIComponent(filePath);
      await client.storage.from(bucket).remove([decoded]);
    }
  } catch (err) {
    // Storage cleanup is best-effort
    console.warn(`Failed to cleanup file from ${bucket}:`, err);
  }
}
