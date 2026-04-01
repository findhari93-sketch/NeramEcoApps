/**
 * Timetable time formatting utilities.
 * Pure functions — no React dependencies.
 */

/**
 * Compact time format for class cards:
 * Same AM/PM period: "9:00 - 10:30 AM" (omit redundant period on start)
 * Different periods: "11:30 AM - 12:30 PM" (show both)
 */
export function formatTimeCompact(start: string, end: string): string {
  const format = (t: string) => {
    const [h, m] = t.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 || 12;
    return { formatted: `${h12}:${m}`, ampm, hour };
  };

  const s = format(start);
  const e = format(end);

  if (s.ampm === e.ampm) {
    return `${s.formatted} - ${e.formatted} ${e.ampm}`;
  }
  return `${s.formatted} ${s.ampm} - ${e.formatted} ${e.ampm}`;
}
