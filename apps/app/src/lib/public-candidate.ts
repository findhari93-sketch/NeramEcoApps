/**
 * Rank and allotment lists hold other candidates' personal details. A tool
 * response may show where similar students landed, never who they are, so
 * every row leaves the server through this allowlist.
 */

const PUBLIC_FIELDS = [
  'rank',
  'aggregate_mark',
  'community',
  'category',
  'allotted_category',
  'college_code',
  'college_name',
  'year',
] as const;

type PublicField = (typeof PUBLIC_FIELDS)[number];
export type PublicCandidate = Partial<Record<PublicField, unknown>>;

export function toPublicCandidate(row: Record<string, unknown>): PublicCandidate {
  const out: PublicCandidate = {};
  for (const key of PUBLIC_FIELDS) {
    if (key in row) out[key] = row[key];
  }
  return out;
}

export function toPublicCandidates(rows: unknown): PublicCandidate[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object').map(toPublicCandidate);
}

/** Drop the similar-students list from a rank prediction that is embedded in another response. */
export function withoutSimilarStudents<T>(prediction: T): T {
  if (!prediction || typeof prediction !== 'object') return prediction;
  const { similarStudents: _omit, ...rest } = prediction as Record<string, unknown>;
  return rest as T;
}
