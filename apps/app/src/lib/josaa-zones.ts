/**
 * Pure helpers that split JoSAA predictor rows into two admission "zones":
 *  - Zone 1 (Paper-2A): NIT / SPA / GFTI rows, predicted from a JEE Main Paper 2A rank.
 *  - Zone 2 (IIT): IIT rows, which admit via JEE Advanced rank plus an AAT Pass and
 *    must NOT carry a Safe/Probable/Reach verdict derived from a Paper-2A rank.
 *
 * Kept framework-free so they are unit-testable without React or Supabase.
 */

export const IIT_INSTITUTE_TYPE = 'IIT';

export interface ZonePartition<T> {
  nonIit: T[];
  iit: T[];
}

/** Split rows by institute_type: IIT rows go to `iit`, everything else to `nonIit`. */
export function partitionByIit<T extends { institute_type: string }>(rows: T[]): ZonePartition<T> {
  const nonIit: T[] = [];
  const iit: T[] = [];
  for (const r of rows) {
    if (r.institute_type === IIT_INSTITUTE_TYPE) iit.push(r);
    else nonIit.push(r);
  }
  return { nonIit, iit };
}

/**
 * Collapse multiple seat rows per IIT into one representative row (the lowest
 * closing rank, i.e. the headline cutoff). Result is sorted by NIRF rank ascending
 * so the strongest IITs lead. Null closing/nirf ranks sort last.
 */
export function dedupeIitByInstitute<
  T extends { institute: string; closing_rank: number | null; nirf_rank: number | null }
>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    const cur = best.get(r.institute);
    if (!cur) {
      best.set(r.institute, r);
      continue;
    }
    const rRank = r.closing_rank ?? Number.POSITIVE_INFINITY;
    const curRank = cur.closing_rank ?? Number.POSITIVE_INFINITY;
    if (rRank < curRank) best.set(r.institute, r);
  }
  return Array.from(best.values()).sort(
    (a, b) => (a.nirf_rank ?? 9999) - (b.nirf_rank ?? 9999),
  );
}
