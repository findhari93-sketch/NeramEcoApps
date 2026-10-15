/**
 * Towns that get the same answer share one indexed page.
 *
 * Neighbouring towns often have the same three nearest NATA test cities (or the
 * same district colleges), so their pages differ only by the town name. Google
 * indexes one of a set like that and skips the rest ("Discovered, currently not
 * indexed"). Instead we pick the strongest town of each set as the indexed page
 * and list the other towns on it, so every town still has an indexed page that
 * names it. The other towns' pages stay up for students as `noindex, follow`.
 *
 * Pure, so it is unit-tested in same-answer.test.ts.
 */
export interface AnswerCandidate {
  slug: string;
  /** Same key = same answer. */
  key: string;
  index: boolean;
  score: number;
  population: number;
}

export interface FoldResult {
  /** Town slug -> the slug of the indexed page that answers for it (itself for a leader). */
  leaderOf: Map<string, string>;
  /** Leader slug -> the other towns it answers for, biggest first. */
  members: Map<string, string[]>;
}

export function foldSameAnswer(towns: AnswerCandidate[]): FoldResult {
  const groups = new Map<string, AnswerCandidate[]>();
  for (const t of towns) groups.set(t.key, [...(groups.get(t.key) ?? []), t]);
  const leaderOf = new Map<string, string>();
  const members = new Map<string, string[]>();
  for (const group of groups.values()) {
    const ranked = [...group].sort((a, b) => Number(b.index) - Number(a.index) || b.score - a.score || b.population - a.population || a.slug.localeCompare(b.slug));
    const leader = ranked[0];
    // A set with no indexable town has no leader: every page keeps its own (held) gate.
    if (!leader.index) {
      for (const t of group) leaderOf.set(t.slug, t.slug);
      continue;
    }
    leaderOf.set(leader.slug, leader.slug);
    const rest = ranked.slice(1).sort((a, b) => b.population - a.population);
    for (const t of rest) leaderOf.set(t.slug, leader.slug);
    if (rest.length) members.set(leader.slug, rest.map((t) => t.slug));
  }
  return { leaderOf, members };
}
