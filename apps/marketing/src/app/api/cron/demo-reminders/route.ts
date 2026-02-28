import { NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getDemoSlotsByDateRange,
  getRegistrationsBySlot,
  updateRegistrationNotification,
  sendDemoClassReminder,
  sendTemplateEmail,
  isWhatsAppConfigured,
  formatTimeForDisplay,
} from '@neram/database';

export const dynamic = 'force-dynamic';

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

export async function GET(request: Request) {
  // Verify cron secret (Vercel sends this header for cron jobs)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdminClient();

    // Get today's date in IST (UTC+5:30)
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const today = istNow.toISOString().split('T')[0];

    // Get all demo slots scheduled for today
    const slots = await getDemoSlotsByDateRange(today, today, {
      status: ['scheduled', 'confirmed'],
    }, supabase);

    if (slots.length === 0) {
      return NextResponse.json({ message: 'No demo classes today', sent: 0 });
    }

    let totalSent = 0;
    const results: Array<{ slotId: string; title: string; sent: number; errors: number }> = [];

    for (const slot of slots) {
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

      // Get approved registrations that haven't received reminder yet
      const { registrations } = await getRegistrationsBySlot(slot.id, {
        status: ['approved'],
        limit: 200,
      }, supabase);

      // Filter out those who already got the reminder
      const needsReminder = registrations.filter(
        (r) => !r.reminder_24h_sent
      );

      let slotSent = 0;
      let slotErrors = 0;

      for (const reg of needsReminder) {
        try {
          // WhatsApp reminder
          if (isWhatsAppConfigured() && reg.phone) {
            await sendDemoClassReminder(reg.phone, {
              userName: reg.name,
              time: displayTime,
              details: meetingDetails,
            });
          }

          // Email reminder
          if (reg.email) {
            await sendTemplateEmail(reg.email, 'demo-class-reminder-24h', {
              name: reg.name,
              date: displayDate,
              time: displayTime,
              duration: String(slot.duration_minutes),
              meeting_link: slot.meeting_link || '',
              venue_address: slot.venue_address || '',
              calendar_link: calendarUrl,
            });
          }

          // Mark reminder as sent
          await updateRegistrationNotification(reg.id, 'reminder_24h', supabase);
          slotSent++;
        } catch (err) {
          console.error(`Reminder failed for ${reg.phone || reg.email}:`, err);
          slotErrors++;
        }
      }

      totalSent += slotSent;
      results.push({
        slotId: slot.id,
        title: slot.title,
        sent: slotSent,
        errors: slotErrors,
      });
    }

    return NextResponse.json({
      success: true,
      date: today,
      slotsProcessed: slots.length,
      totalSent,
      results,
    });
  } catch (error) {
    console.error('Cron demo-reminders error:', error);
    return NextResponse.json(
      { error: 'Failed to send reminders' },
      { status: 500 }
    );
  }
}
