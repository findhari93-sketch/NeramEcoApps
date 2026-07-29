/**
 * Turning the words an AI (or a teacher) used for a topic into a registry tag.
 *
 * The wrap-up generator used to compare `label.toLowerCase()` against the
 * registry and nothing else. That matches only when the model happens to phrase
 * a tag exactly the way the seed migration's `initcap(replace(slug,'_',' '))`
 * did, so in practice it missed almost everything:
 *
 *   "One Point Perspective"  vs slug one_point_perspective   (spaces vs underscores)
 *   "Vanishing Point"        vs tag perspective              (an alias, never indexed)
 *   "3D Visualization"       vs label "Visualization 3d"     (word order)
 *   "Shadows & Shading"      vs tag shadow                   (punctuation, plural)
 *
 * Each miss then became a create, whose slug collided with the very tag it had
 * failed to match, so the create 409'd and the teacher ended up with no tag at
 * all. Matching properly here is what stops that chain at the first link.
 *
 * Four keys per tag, tried in decreasing confidence: the slug, the slug with its
 * words sorted (word-order differences), and the singular form of each. Aliases
 * are indexed exactly like labels, which is the whole reason that column exists.
 */
import { qbSlugify } from '@neram/database';

export interface RegistryTag {
  id: string;
  slug: string;
  label: string;
  group_type: string;
  color?: string | null;
  aliases?: string[] | null;
}

export interface TagIndex {
  /** Exact slug match. Authoritative: never overwritten by a weaker key. */
  bySlug: Map<string, RegistryTag>;
  /** Word-order and plural insensitive. First writer wins. */
  byShape: Map<string, RegistryTag>;
}

/** "shadows" -> "shadow". Left alone when too short or already ending in "ss". */
function singular(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith('ss')) return token;
  return token.endsWith('s') ? token.slice(0, -1) : token;
}

/** A key that ignores word order and plurals: "3d_visualization" == "visualization_3d". */
function shapeKey(slug: string): string {
  return slug.split('_').filter(Boolean).map(singular).sort().join('_');
}

/** Every spelling of one tag: its slug, its label, and each alias. */
function keysFor(tag: RegistryTag): string[] {
  return [tag.slug, tag.label, ...(tag.aliases || [])]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => qbSlugify(v))
    .filter(Boolean);
}

export function buildTagIndex(tags: RegistryTag[]): TagIndex {
  const bySlug = new Map<string, RegistryTag>();
  const byShape = new Map<string, RegistryTag>();

  for (const tag of tags) {
    for (const key of keysFor(tag)) {
      if (!bySlug.has(key)) bySlug.set(key, tag);
      const shape = shapeKey(key);
      if (shape && !byShape.has(shape)) byShape.set(shape, tag);
    }
  }

  return { bySlug, byShape };
}

/** One phrase against the index: exact slug, then parenthetical-free, then shape. */
function matchPhrase(index: TagIndex, text: string): RegistryTag | null {
  const slug = qbSlugify(text || '');
  if (!slug) return null;

  const exact = index.bySlug.get(slug);
  if (exact) return exact;

  // Drop a parenthetical qualifier: "Perspective (1-point)" -> "Perspective".
  const withoutParens = qbSlugify((text || '').replace(/\([^)]*\)/g, ' '));
  if (withoutParens && withoutParens !== slug) {
    const trimmed = index.bySlug.get(withoutParens);
    if (trimmed) return trimmed;
  }

  for (const candidate of [slug, withoutParens]) {
    if (!candidate) continue;
    const shaped = index.byShape.get(shapeKey(candidate));
    if (shaped) return shaped;
  }

  return null;
}

/**
 * Resolve one piece of text (a slug the model picked, or a label it invented)
 * to a registry tag. Returns null when nothing plausible matches, which is the
 * signal that this really is a new idea.
 */
export function resolveTag(index: TagIndex, text: string): RegistryTag | null {
  const direct = matchPhrase(index, text);
  if (direct) return direct;

  // A joined phrase, "Shadows & Shading", where both halves name the same tag.
  // Every part has to resolve, and they all have to resolve to the SAME tag:
  // "Plan and Elevation" names two things and is left as a proposal rather than
  // being silently collapsed into whichever half matched first.
  const parts = (text || '')
    .split(/\s*(?:&|\/|\+|,|\band\b)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length > 1) {
    const hits = parts.map((p) => matchPhrase(index, p));
    if (hits.every((h): h is RegistryTag => h !== null)) {
      const ids = new Set(hits.map((h) => h.id));
      if (ids.size === 1) return hits[0];
    }
  }

  return null;
}

export interface ResolvedTags {
  /** Registry tags to tick on immediately, deduplicated, in the order suggested. */
  matched: RegistryTag[];
  /** Genuinely new ideas, for the teacher to accept or ignore. */
  unmatched: Array<{ label: string; group_type: 'subject' | 'theme' }>;
}

/**
 * Resolve everything the model returned.
 *
 * `newTags` are run through the same index as `tagSlugs` on purpose: a model
 * that ignores the allowed list and invents "Orthographic Projection" should
 * still land on the existing tag rather than minting a duplicate.
 */
export function resolveSuggestedTags(input: {
  registry: RegistryTag[];
  tagSlugs?: string[];
  newTags?: Array<{ label: string; group_type: 'subject' | 'theme' }>;
}): ResolvedTags {
  const index = buildTagIndex(input.registry);
  const matched: RegistryTag[] = [];
  const seenIds = new Set<string>();
  const unmatched: ResolvedTags['unmatched'] = [];
  const seenLabels = new Set<string>();

  const take = (tag: RegistryTag) => {
    if (seenIds.has(tag.id)) return;
    seenIds.add(tag.id);
    matched.push(tag);
  };

  for (const slug of input.tagSlugs || []) {
    const tag = resolveTag(index, slug);
    if (tag) take(tag);
    else if (slug.trim()) {
      // The model answered with a slug that is not in the registry. Treat it as
      // a proposal, with the underscores turned back into words.
      const label = slug.trim().replace(/_/g, ' ').replace(/\s+/g, ' ');
      const key = qbSlugify(label);
      if (key && !seenLabels.has(key)) {
        seenLabels.add(key);
        unmatched.push({ label: titleCase(label), group_type: 'theme' });
      }
    }
  }

  for (const proposal of input.newTags || []) {
    const tag = resolveTag(index, proposal.label);
    if (tag) {
      take(tag);
      continue;
    }
    const key = qbSlugify(proposal.label);
    if (!key || seenLabels.has(key)) continue;
    seenLabels.add(key);
    unmatched.push({ label: proposal.label.trim(), group_type: proposal.group_type });
  }

  return { matched, unmatched };
}

function titleCase(text: string): string {
  return text.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
