/**
 * Recurrence date generation logic — extracted for testability.
 */

const DAY_MAP: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/** Format a Date as YYYY-MM-DD using local time (avoids UTC timezone shift). */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Generate all dates for a recurrence rule between startDate and endDate (inclusive).
 * Rules: "daily" (Mon-Sat), "weekly:mon,wed,fri" (specific weekdays)
 */
export function generateRecurrenceDates(startDate: string, endDate: string, rule: string): string[] {
  const start = new Date(startDate + 'T12:00:00'); // Noon to avoid DST/timezone edge cases
  const end = new Date(endDate + 'T12:00:00');
  const dates: string[] = [];

  if (rule === 'daily') {
    // Mon-Sat (skip Sunday = 0)
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 0) {
        dates.push(formatDate(d));
      }
    }
  } else if (rule.startsWith('weekly:')) {
    const dayNames = rule.replace('weekly:', '').split(',');
    const allowedDays = new Set(dayNames.map((name) => DAY_MAP[name.trim().toLowerCase()]).filter((n) => n !== undefined));

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (allowedDays.has(d.getDay())) {
        dates.push(formatDate(d));
      }
    }
  } else {
    // Unknown rule — just return the start date
    dates.push(startDate);
  }

  return dates;
}
