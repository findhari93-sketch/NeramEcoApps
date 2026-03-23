// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { updateOCRResult } from '@neram/database/queries';
import { extractQuestionsFromImage } from '@/lib/exam-recall-ai';

/**
 * POST /api/exam-recall/ocr
 *
 * Trigger OCR processing for an upload.
 * Body: { upload_id }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { upload_id } = body;

    if (!upload_id) {
      return NextResponse.json({ error: 'Missing required field: upload_id' }, { status: 400 });
    }

    // Fetch the upload record
    const { data: upload, error: fetchErr } = await supabase
      .from('nexus_exam_recall_uploads')
      .select('*')
      .eq('id', upload_id)
      .single();

    if (fetchErr || !upload) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
    }

    const uploadData = upload as any;

    // Mark as processing
    await updateOCRResult(upload_id, { ocr_status: 'processing' as any });

    try {
      // Download the file from storage
      const { data: fileData, error: downloadErr } = await supabase.storage
        .from('uploads')
        .download(uploadData.storage_path);

      if (downloadErr || !fileData) {
        await updateOCRResult(upload_id, { ocr_status: 'failed' as any });
        return NextResponse.json({ error: 'Failed to download file from storage' }, { status: 500 });
      }

      // Convert to base64
      const arrayBuffer = await fileData.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');

      // Run OCR via Gemini
      const questions = await extractQuestionsFromImage(base64, uploadData.mime_type);

      // Combine all extracted text
      const extractedText = questions.map((q) => q.question_text).join('\n\n');
      const avgConfidence = questions.length > 0
        ? questions.reduce((sum, q) => sum + q.confidence, 0) / questions.length
        : 0;

      // Update the upload record with results
      const updated = await updateOCRResult(upload_id, {
        ocr_status: questions.length > 0 ? 'completed' as any : 'failed' as any,
        ocr_extracted_text: extractedText || null,
        ocr_confidence: avgConfidence || null,
        ocr_extracted_questions: questions.length > 0 ? questions : null,
      });

      return NextResponse.json({
        upload: updated,
        questions,
      });
    } catch (ocrErr) {
      // Mark as failed
      await updateOCRResult(upload_id, { ocr_status: 'failed' as any });
      throw ocrErr;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to process OCR';
    console.error('[exam-recall/ocr] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
