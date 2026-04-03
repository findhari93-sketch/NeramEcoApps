// @ts-nocheck — course plan tables not yet in generated types
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  submitHomework,
} from '@neram/database';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
const MAX_FILES = 5;

/**
 * POST /api/course-plans/homework/[hwId]/submit
 * Student submission. Accepts FormData (multipart).
 * Files uploaded to Supabase Storage bucket `homework-submissions`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ hwId: string }> }
) {
  try {
    const { hwId: homeworkId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get homework to verify enrollment
    const { data: homework } = await supabase
      .from('nexus_course_plan_homework')
      .select('plan_id')
      .eq('id', homeworkId)
      .single();

    if (!homework) {
      return NextResponse.json({ error: 'Homework not found' }, { status: 404 });
    }

    const { data: plan } = await supabase
      .from('nexus_course_plans')
      .select('classroom_id')
      .eq('id', homework.plan_id)
      .single();

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', plan.classroom_id)
      .eq('is_active', true)
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Not enrolled in this classroom' }, { status: 403 });
    }

    // Parse FormData
    const formData = await request.formData();
    const textResponse = formData.get('text_response') as string | null;
    const files: File[] = [];

    for (const [key, value] of formData.entries()) {
      if (key === 'files' && value instanceof File) {
        files.push(value);
      }
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Maximum ${MAX_FILES} files allowed` }, { status: 400 });
    }

    // Upload files to Supabase Storage
    const attachments: Array<{ url: string; name: string; size: number; type: string }> = [];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `File "${file.name}" exceeds 10MB limit` }, { status: 400 });
      }

      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${plan.classroom_id}/${homeworkId}/${user.id}/${timestamp}-${safeName}`;

      const fileBuffer = await file.arrayBuffer();
      const { error: uploadError } = await supabase.storage
        .from('homework-submissions')
        .upload(storagePath, fileBuffer, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        console.error('File upload error:', uploadError);
        return NextResponse.json({ error: `Failed to upload file: ${file.name}` }, { status: 500 });
      }

      const { data: urlData } = supabase.storage
        .from('homework-submissions')
        .getPublicUrl(storagePath);

      attachments.push({
        url: urlData.publicUrl,
        name: file.name,
        size: file.size,
        type: file.type,
      });
    }

    // Submit homework
    const submission = await submitHomework(homeworkId, user.id, {
      attachments: attachments.length > 0 ? attachments : undefined,
      text_response: textResponse || undefined,
    }, supabase);

    return NextResponse.json({ submission }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to submit homework';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
