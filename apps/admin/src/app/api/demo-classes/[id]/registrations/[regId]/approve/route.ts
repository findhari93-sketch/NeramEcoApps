import { NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  approveRegistration,
  getRegistrationById,
  getDemoSlotById,
  updateRegistrationNotification,
  sendDemoClassApproved,
  sendTemplateEmail,
  isWhatsAppConfigured,
  formatTimeForDisplay,
} from '@neram/database';

function generateGoogleCalendarUrl(params: {
  title: string;
  date: string;
  time: string;
  duration: number;
  meetingLink?: string;
}): string {
  const [hours, minutes] = params.time.split(':').map(Number);
  const start = new Date(`${params.date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00+05:30`);
  const end = new Date(start.getTime() + params.duration * 60000);

  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const details = params.meetingLink
    ? `Join here: ${params.meetingLink}`
    : 'Details will be shared before the class';

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(params.title)}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(details)}`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; regId: string }> }
) {
  try {
    const { id, regId } = await params;
    const supabase = getSupabaseAdminClient();

    // Check if registration exists
    const existingReg = await getRegistrationById(regId, supabase);
    if (!existingReg) {
      return NextResponse.json(
        { error: 'Registration not found' },
        { status: 404 }
      );
    }

    // Verify registration belongs to this slot
    if (existingReg.slot_id !== id) {
      return NextResponse.json(
        { error: 'Registration does not belong to this slot' },
        { status: 400 }
      );
    }

    // Check if already processed
    if (existingReg.status !== 'pending') {
      return NextResponse.json(
        { error: 'Registration already processed' },
        { status: 400 }
      );
    }

    // TODO: Get admin ID from session
    const adminId = 'admin'; // Placeholder

    const registration = await approveRegistration(regId, adminId, supabase);

    // Get slot details for notifications
    const slot = await getDemoSlotById(id, supabase);

    if (slot) {
      const displayDate = new Date(slot.slot_date + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const displayTime = formatTimeForDisplay(slot.slot_time);
      const calendarUrl = generateGoogleCalendarUrl({
        title: slot.title,
        date: slot.slot_date,
        time: slot.slot_time,
        duration: slot.duration_minutes,
        meetingLink: slot.meeting_link || undefined,
      });
      const meetingDetails = slot.meeting_link
        ? `Meeting Link: ${slot.meeting_link}\nAdd to Calendar: ${calendarUrl}`
        : `Add to Calendar: ${calendarUrl}`;

      // Send WhatsApp (non-blocking)
      if (isWhatsAppConfigured() && existingReg.phone) {
        sendDemoClassApproved(existingReg.phone, {
          userName: existingReg.name,
          date: displayDate,
          time: displayTime,
          details: meetingDetails,
        })
          .then(() => updateRegistrationNotification(regId, 'whatsapp', supabase))
          .catch((err) => console.error('WhatsApp demo approval failed:', err));
      }

      // Send Email (non-blocking)
      if (existingReg.email) {
        sendTemplateEmail(existingReg.email, 'demo-class-confirmation', {
          name: existingReg.name,
          date: displayDate,
          time: displayTime,
          duration: String(slot.duration_minutes),
          meeting_link: slot.meeting_link || '',
          venue_address: slot.venue_address || '',
          calendar_link: calendarUrl,
        })
          .then(() => updateRegistrationNotification(regId, 'confirmation_email', supabase))
          .catch((err) => console.error('Email demo approval failed:', err));
      }
    }

    return NextResponse.json({ registration });
  } catch (error) {
    console.error('Error approving registration:', error);
    return NextResponse.json(
      { error: 'Failed to approve registration' },
      { status: 500 }
    );
  }
}
