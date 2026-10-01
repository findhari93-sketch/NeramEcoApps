/**
 * The NATA year students are preparing for. The cycle rolls over in September:
 * until August 2026 it is NATA 2026, from September 2026 it is NATA 2027.
 * Mirrors getAcademicYear() in the cutoff calculator. Public pages revalidate
 * daily, so titles move to the new year on their own.
 */
export function nataCycleYear(now: Date = new Date()): number {
  // IST is UTC+5:30; use it so the rollover happens at Indian midnight.
  const ist = new Date(now.getTime() + 330 * 60 * 1000);
  const year = ist.getUTCFullYear();
  return ist.getUTCMonth() < 8 ? year : year + 1;
}
