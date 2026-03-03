export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getDemoSlotById,
  getRegistrationsBySlot,
  updateRegistrationNotification,
  sendTemplateEmail,
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();

    const slot = await getDemoSlotById(id, supabase);
    if (!slot) {
      return NextResponse.json({ error: 'Slot not found' }, { status: 404 });
    }

    // Get approved registrations with email
    const { registrations } = await getRegistrationsBySlot(id, {
      status: ['approved', 'attended'],
      limit: 200,
    }, supabase);

    const withEmail = registrations.filter((r) => r.email);
    if (withEmail.length === 0) {
      return NextResponse.json({ error: 'No registrants with email addresses' }, { status: 400 });
    }

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

    let sentCount = 0;
    for (const reg of withEmail) {
      try {
        await sendTemplateEmail(reg.email!, 'demo-class-confirmation', {
          name: reg.name,
          date: displayDate,
          time: displayTime,
          duration: String(slot.duration_minutes),
          meeting_link: slot.meeting_link || '',
          venue_address: slot.venue_address || '',
          calendar_link: calendarUrl,
        });
        await updateRegistrationNotification(reg.id, 'confirmation_email', supabase);
        sentCount++;
      } catch (err) {
        console.error(`Email to ${reg.email} failed:`, err);
      }
    }

    return NextResponse.json({ success: true, sentCount, totalEligible: withEmail.length });
  } catch (error) {
    console.error('Error sending emails:', error);
    return NextResponse.json({ error: 'Failed to send emails' }, { status: 500 });
  }
}