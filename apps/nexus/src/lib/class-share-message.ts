/**
 * Builds a plain-text class announcement a teacher can paste into the WhatsApp
 * group. No em dashes (repo content rule). Times are treated as IST wall-clock.
 */

export interface ClassShareInput {
  title: string;
  /** YYYY-MM-DD */
  scheduled_date: string;
  /** HH:MM (24h) */
  start_time: string;
  /** HH:MM (24h) */
  end_time: string;
  joinUrl?: string | null;
  description?: string | null;
}

/** "18:30" or "18:30:00" -> "6:30 PM" */
function formatTime(time: string): string {
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  if (Number.isNaN(hour)) return time;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${(m ?? '00').padStart(2, '0')} ${ampm}`;
}

/** "2026-07-24" -> "Fri, 24 Jul 2026" (IST) */
function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

export function buildClassWhatsAppMessage(input: ClassShareInput): string {
  const lines: string[] = [];
  lines.push(`📢 Class scheduled: ${input.title.trim()}`);
  lines.push('');
  lines.push(`🗓️ ${formatDate(input.scheduled_date)}`);
  lines.push(`⏰ ${formatTime(input.start_time)} to ${formatTime(input.end_time)} (IST)`);

  const desc = (input.description || '').trim();
  if (desc) {
    lines.push('');
    lines.push(desc);
  }

  if (input.joinUrl) {
    lines.push('');
    lines.push(`🔗 Join on Teams: ${input.joinUrl}`);
  }

  lines.push('');
  lines.push('See you in class 👋');

  return lines.join('\n');
}
