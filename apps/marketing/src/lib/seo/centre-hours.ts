/**
 * Turns offline_centers.operating_hours ({ mon: { open, close } | null, ... })
 * into short lines such as "Mon to Fri: 9 am to 6 pm" and "Sun: closed".
 */
import type { ClassroomCentre } from './facts';

const ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const LABEL: Record<(typeof ORDER)[number], string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};
const LONG_TO_SHORT: Record<string, (typeof ORDER)[number]> = {
  monday: 'mon', tuesday: 'tue', wednesday: 'wed', thursday: 'thu', friday: 'fri', saturday: 'sat', sunday: 'sun',
};

/** "09:00" -> "9 am", "13:30" -> "1:30 pm". */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h)) return hhmm;
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

export function formatCentreHours(hours: ClassroomCentre['hours']): string[] {
  if (!hours || Object.keys(hours).length === 0) return [];
  const byDay = new Map<string, string>();
  for (const [key, h] of Object.entries(hours)) {
    const day = LONG_TO_SHORT[key.toLowerCase()] ?? key.toLowerCase();
    byDay.set(day, h ? `${formatClock(h.open)} to ${formatClock(h.close)}` : 'closed');
  }
  const lines: string[] = [];
  let i = 0;
  while (i < ORDER.length) {
    const value = byDay.get(ORDER[i]) ?? 'closed';
    let j = i;
    while (j + 1 < ORDER.length && (byDay.get(ORDER[j + 1]) ?? 'closed') === value) j++;
    const days = i === j ? LABEL[ORDER[i]] : `${LABEL[ORDER[i]]} to ${LABEL[ORDER[j]]}`;
    lines.push(`${days}: ${value}`);
    i = j + 1;
  }
  return lines;
}
