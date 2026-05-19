export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { Resend } from 'resend';

/**
 * POST /api/ask-seniors/register
 *
 * Register a student for an #AskSeniors event.
 * Public endpoint, no authentication required.
 *
 * Request body:
 * - event_id: string (required)
 * - name: string (required)
 * - phone: string (required)
 * - email: string (required)
 * - city?: string
 * - state?: string
 * - nata_attempts: 1 | 2
 * - nata_score_1: number (required)
 * - nata_score_2?: number
 * - board_score: number (required)
 * - college_preferences: string[]
 *
 * Response:
 * - 201: { success: true, registration_id: string }
 * - 400: { error: string }
 * - 500: { error: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      event_id,
      name,
      phone,
      email,
      city,
      state,
      nata_attempts,
      nata_score_1,
      nata_score_2,
      board_score,
      college_preferences,
    } = body;

    // Validate required fields
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!phone) {
      return NextResponse.json({ error: 'phone is required' }, { status: 400 });
    }
    if (!email) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 });
    }
    if (nata_score_1 === undefined || nata_score_1 === null) {
      return NextResponse.json({ error: 'nata_score_1 is required' }, { status: 400 });
    }
    if (board_score === undefined || board_score === null) {
      return NextResponse.json({ error: 'board_score is required' }, { status: 400 });
    }
    if (!event_id) {
      return NextResponse.json({ error: 'event_id is required' }, { status: 400 });
    }

    // Compute final cutoff score
    const final_cutoff =
      nata_attempts === 2
        ? Math.max(Number(nata_score_1), Number(nata_score_2 ?? 0))
        : Number(nata_score_1);

    // Insert into DB
    const supabase = getSupabaseAdminClient();
    const { data, error: dbError } = await supabase
      .from('ask_seniors_registrations')
      .insert({
        event_id,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
        city: city?.trim() || null,
        state: state?.trim() || null,
        nata_attempts: Number(nata_attempts) || 1,
        nata_score_1: Number(nata_score_1),
        nata_score_2: nata_score_2 !== undefined ? Number(nata_score_2) : null,
        board_score: Number(board_score),
        final_cutoff,
        college_preferences: college_preferences || [],
      })
      .select('id')
      .single();

    if (dbError) {
      console.error('AskSeniors registration DB error:', dbError);
      return NextResponse.json(
        { error: 'Registration failed. Please try again.' },
        { status: 500 }
      );
    }

    // Fire-and-forget confirmation email to the student
    sendRegistrationConfirmationEmail(email.trim(), name.trim()).catch(console.error);

    return NextResponse.json({ success: true, registration_id: data.id }, { status: 201 });
  } catch (error) {
    console.error('AskSeniors registration error:', error);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}

async function sendRegistrationConfirmationEmail(
  to: string,
  name: string
): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);

  await resend.emails.send({
    from: 'Neram Classes <noreply@neramclasses.com>',
    to,
    subject: "You're registered for #AskSeniors 2026!",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
        <h2 style="color: #1e40af;">You are registered for AskSeniors 2026!</h2>
        <p>Hi ${escapeHtml(name)},</p>
        <p>
          Thank you for registering for the <strong>#AskSeniors 2026</strong> live session by Neram Classes.
          We are excited to have you join us!
        </p>
        <p>
          You will receive the event link and joining details via email before the session starts.
          Please keep an eye on your inbox (and check your spam folder just in case).
        </p>
        <p>
          In the meantime, if you have any questions, feel free to reach out to us at
          <a href="mailto:support@neramclasses.com">support@neramclasses.com</a>.
        </p>
        <p style="margin-top: 32px;">See you at the session!</p>
        <p>
          Warm regards,<br />
          <strong>Team Neram Classes</strong>
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
        <p style="font-size: 12px; color: #6b7280;">
          You are receiving this email because you registered for an AskSeniors event at
          <a href="https://neramclasses.com">neramclasses.com</a>.
        </p>
      </div>
    `,
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
