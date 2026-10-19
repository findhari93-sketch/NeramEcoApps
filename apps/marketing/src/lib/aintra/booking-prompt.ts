/**
 * The booking lines of Aintra's system prompt: the demo days really open now,
 * and, for a signed-in visitor, what they already booked. Pure, so the wording
 * is unit tested; the chat route does the reads.
 */
import {
  availableDemoDays,
  formatDemoPreference,
  type DemoScheduleSettings,
  type DemoWindow,
} from '@neram/database/demo-schedule';

/** "Open demo slots (India time): Today 19 Oct: Evening. Tomorrow 20 Oct: Morning, Afternoon, Evening. ..." */
export function demoDaysPrompt(now: Date, schedule: DemoScheduleSettings): string {
  const days = availableDemoDays(now, schedule);
  const today = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  if (!days.length) {
    return `\n\n## DEMO SLOTS NOW\nToday is ${today} (India). No demo slots are open in the next few days. Offer [[book:callback]] instead.`;
  }
  const label = (id: string) => schedule.windows.find((w) => w.id === id)?.label ?? id;
  const lines = days.map((d) => `- ${d.label} ${d.sub} (${d.date}): ${d.windows.map(label).join(', ')}`);
  return `\n\n## DEMO SLOTS NOW\nToday is ${today} (India). Open demo class slots, with the date to use in [[book:demo,DATE,window]]:\n${lines.join('\n')}`;
}

export interface VisitorBookings {
  demo: { ref: string; preferredDate: string | null; preferredWindow: string | null; status: string } | null;
  openCallback: { preferredDate: string | null; preferredSlot: string | null } | null;
}

/** What this signed-in visitor already has, so Aintra offers a change instead of a second booking. */
export function visitorBookingsPrompt(b: VisitorBookings, schedule: DemoScheduleSettings): string {
  const lines: string[] = [];
  if (b.demo) {
    const when = formatDemoPreference(b.demo.preferredDate, b.demo.preferredWindow as DemoWindow, schedule);
    lines.push(
      `- This visitor already has a demo class booked (ref ${b.demo.ref}, ${when}${b.demo.status === 'approved' ? ', confirmed' : ', waiting for our call'}). ` +
        'If they ask about it or want another time, say so and add [[book:demo]]: the card shows their booking with Change time. Never book a second one.',
    );
  }
  if (b.openCallback) {
    const when = [b.openCallback.preferredDate, b.openCallback.preferredSlot].filter(Boolean).join(' ');
    lines.push(
      `- This visitor already asked for a callback${when ? ` (${when})` : ''}. Tell them our team will call; add [[book:callback]] only if they want a different time.`,
    );
  }
  return lines.length ? `\n\n## THIS VISITOR'S BOOKINGS\n${lines.join('\n')}` : '';
}
