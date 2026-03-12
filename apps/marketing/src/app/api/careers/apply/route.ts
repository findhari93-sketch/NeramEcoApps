export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, notifyAdmin, createJobApplication } from '@neram/database';

/**
 * POST /api/careers/apply
 *
 * Submit a job application.
 * Public endpoint - no authentication required.
 *
 * Accepts multipart/form-data or JSON body:
 * - applicant_name: string (required)
 * - applicant_email: string (required)
 * - applicant_phone: string (required)
 * - job_posting_id: string (required)
 * - terms_agreed: boolean (required, must be true)
 * - resume: File (optional, PDF/DOC/DOCX, max 5MB)
 * - portfolio_url: string (optional)
 * - screening_answers: JSON string of ScreeningAnswer[] (optional)
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let applicantName: string;
    let applicantEmail: string;
    let applicantPhone: string;
    let jobPostingId: string;
    let termsAgreed: boolean;
    let portfolioUrl: string | null = null;
    let screeningAnswers: Array<{ question_id: string; answer: string | number | boolean | string[] }> = [];
    let resumeFile: File | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      applicantName = formData.get('applicant_name') as string;
      applicantEmail = formData.get('applicant_email') as string;
      applicantPhone = formData.get('applicant_phone') as string;
      jobPostingId = formData.get('job_posting_id') as string;
      termsAgreed = formData.get('terms_agreed') === 'true';
      portfolioUrl = (formData.get('portfolio_url') as string) || null;
      const screeningAnswersStr = formData.get('screening_answers') as string;
      if (screeningAnswersStr) {
        try {
          screeningAnswers = JSON.parse(screeningAnswersStr);
        } catch {
          return NextResponse.json(
            { success: false, error: 'Invalid screening_answers format' },
            { status: 400 }
          );
        }
      }
      resumeFile = formData.get('resume') as File | null;
    } else {
      const body = await request.json();
      applicantName = body.applicant_name;
      applicantEmail = body.applicant_email;
      applicantPhone = body.applicant_phone;
      jobPostingId = body.job_posting_id;
      termsAgreed = body.terms_agreed;
      portfolioUrl = body.portfolio_url || null;
      screeningAnswers = body.screening_answers || [];
    }

    // ---- Validation ----

    if (!applicantName || applicantName.trim().length < 2) {
      return NextResponse.json(
        { success: false, error: 'Name is required (minimum 2 characters)' },
        { status: 400 }
      );
    }

    if (!applicantEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicantEmail)) {
      return NextResponse.json(
        { success: false, error: 'A valid email address is required' },
        { status: 400 }
      );
    }

    // Indian phone: optional +91, then 10 digits
    const phoneClean = applicantPhone?.replace(/[\s\-()]/g, '') || '';
    if (!phoneClean || !/^(\+91)?[6-9]\d{9}$/.test(phoneClean)) {
      return NextResponse.json(
        { success: false, error: 'A valid Indian phone number is required (10 digits)' },
        { status: 400 }
      );
    }

    if (!jobPostingId) {
      return NextResponse.json(
        { success: false, error: 'Job posting ID is required' },
        { status: 400 }
      );
    }

    if (!termsAgreed) {
      return NextResponse.json(
        { success: false, error: 'You must agree to the terms' },
        { status: 400 }
      );
    }

    // ---- Resume upload ----

    let resumeUrl: string | null = null;

    if (resumeFile && resumeFile.size > 0) {
      // Validate file type
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];
      if (!allowedTypes.includes(resumeFile.type)) {
        return NextResponse.json(
          { success: false, error: 'Resume must be PDF, DOC, or DOCX format' },
          { status: 400 }
        );
      }

      // Validate file size (5MB)
      if (resumeFile.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          { success: false, error: 'Resume file must be less than 5MB' },
          { status: 400 }
        );
      }

      const supabase = createAdminClient();
      const fileExtension = resumeFile.name.split('.').pop() || 'pdf';
      const timestamp = Date.now();
      const safeName = applicantName.trim().replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const filePath = `resumes/${jobPostingId}/${safeName}_${timestamp}.${fileExtension}`;

      const arrayBuffer = await resumeFile.arrayBuffer();
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('job-applications')
        .upload(filePath, arrayBuffer, {
          contentType: resumeFile.type,
          upsert: false,
        });

      if (uploadError) {
        console.error('Resume upload error:', uploadError);
        // Continue without resume rather than failing the whole application
      } else {
        const { data: urlData } = supabase.storage
          .from('job-applications')
          .getPublicUrl(uploadData.path);
        resumeUrl = urlData.publicUrl;
      }
    }

    // ---- Create application ----

    const supabase = createAdminClient();
    const application = await createJobApplication(
      {
        job_posting_id: jobPostingId,
        applicant_name: applicantName.trim(),
        applicant_email: applicantEmail.trim().toLowerCase(),
        applicant_phone: phoneClean,
        resume_url: resumeUrl,
        portfolio_url: portfolioUrl?.trim() || null,
        screening_answers: screeningAnswers,
        terms_agreed: termsAgreed,
        terms_agreed_at: new Date().toISOString(),
      },
      supabase
    );

    // ---- Send notification email ----
    try {
      await notifyAdmin(
        `New Job Application: ${applicantName.trim()}`,
        `
          <h2>New Job Application Received</h2>
          <p><strong>Name:</strong> ${applicantName.trim()}</p>
          <p><strong>Email:</strong> ${applicantEmail.trim().toLowerCase()}</p>
          <p><strong>Phone:</strong> ${phoneClean}</p>
          <p><strong>Job Posting ID:</strong> ${jobPostingId}</p>
          ${portfolioUrl ? `<p><strong>Portfolio:</strong> <a href="${portfolioUrl}">${portfolioUrl}</a></p>` : ''}
          ${resumeUrl ? `<p><strong>Resume:</strong> <a href="${resumeUrl}">Download</a></p>` : '<p><em>No resume uploaded</em></p>'}
          <p>View the application in the Admin dashboard.</p>
        `
      );
    } catch (err) {
      console.error('Career application notification failed:', err);
    }

    return NextResponse.json(
      { success: true, data: { id: application.id } },
      { status: 201 }
    );
  } catch (error) {
    console.error('Job application submission error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit your application. Please try again.' },
      { status: 500 }
    );
  }
}
