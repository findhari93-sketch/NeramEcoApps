/**
 * Turns the chatbot_geo_summary RPC result into what the Chat History
 * "Locations" view draws.
 *
 * State names arrive from two places and rarely agree on spelling: Cloudflare's
 * cf-region ("National Capital Territory of Delhi", "Orissa" on older data) and
 * the application form's free text ("PUNJAB", "TN"). Every name is mapped to a
 * @neram/geo STATES slug, which is also the key of the map's SVG paths, and
 * spellings of the same state are merged. A name that maps to nothing is kept
 * as its own row rather than dropped, so the totals still add up.
 *
 * Server-only: the @neram/geo barrel carries the whole city registry, which has
 * no business in the browser bundle.
 */

import { STATES } from '@neram/geo';
import { INDIA_STATES } from '@neram/database/signup-geo';

export interface RawChatGeoSummary {
  total_sessions: number;
  total_messages: number;
  located_sessions: number;
  india_sessions: number;
  abroad_sessions: number;
  india_no_state_sessions: number;
  by_state: { state: string; sessions: number; messages: number }[];
  by_city: { city: string; state: string | null; country: string | null; sessions: number }[];
  by_country: { country: string; sessions: number }[];
  tracking_since: string | null;
}

export interface ChatGeoState {
  /** @neram/geo slug, or null when the name matched no state. */
  slug: string | null;
  name: string;
  sessions: number;
  messages: number;
}

export interface ChatGeoCity {
  city: string;
  /** Display name of the state (or the country, outside India). */
  region: string | null;
  stateSlug: string | null;
  country: string | null;
  sessions: number;
}

export interface ChatGeoSummary {
  totals: {
    sessions: number;
    messages: number;
    located: number;
    india: number;
    abroad: number;
    indiaNoState: number;
    unknown: number;
  };
  states: ChatGeoState[];
  cities: ChatGeoCity[];
  countries: { code: string; name: string; sessions: number }[];
  trackingSince: string | null;
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const STATE_BY_SLUG = new Map(STATES.map((s) => [s.slug, s]));

/** Spellings seen in the wild, slugified, that are not a STATES slug. */
const ALIASES: Record<string, string> = {
  'national-capital-territory-of-delhi': 'delhi',
  'nct-of-delhi': 'delhi',
  'new-delhi': 'delhi',
  orissa: 'odisha',
  pondicherry: 'puducherry',
  uttaranchal: 'uttarakhand',
  tamilnadu: 'tamil-nadu',
  'andaman-and-nicobar-islands': 'andaman-and-nicobar',
  'jammu-kashmir': 'jammu-and-kashmir',
  'dadra-and-nagar-haveli': 'dadra-and-nagar-haveli-and-daman-and-diu',
  'daman-and-diu': 'dadra-and-nagar-haveli-and-daman-and-diu',
  'the-dadra-and-nagar-haveli-and-daman-and-diu': 'dadra-and-nagar-haveli-and-daman-and-diu',
};

/** The STATES slug a free-text state name or ISO code refers to, or null. */
export function stateSlugFor(raw: string | null | undefined): string | null {
  const name = raw?.trim();
  if (!name) return null;

  // "TN", "KA": the form sometimes stores the ISO 3166-2:IN code.
  const fromCode = name.length <= 3 ? INDIA_STATES[name.toUpperCase()] : undefined;
  const slug = slugify(fromCode ?? name);
  if (STATE_BY_SLUG.has(slug)) return slug;
  const alias = ALIASES[slug];
  return alias && STATE_BY_SLUG.has(alias) ? alias : null;
}

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** "chennai", "CHENNAI " and "Chennai" are one city. */
const cityKey = (city: string) => city.trim().toLowerCase().replace(/\s+/g, ' ');

const titleCase = (s: string) =>
  s.trim().replace(/\s+/g, ' ').replace(/\b([a-z])([a-z]*)/gi, (_, a: string, b: string) => a.toUpperCase() + b.toLowerCase());

export function buildChatGeoSummary(raw: RawChatGeoSummary | null | undefined): ChatGeoSummary {
  const r = raw ?? ({} as Partial<RawChatGeoSummary>);
  const sessions = Number(r.total_sessions ?? 0);
  const located = Number(r.located_sessions ?? 0);

  // States: merge spellings onto one slug.
  const stateRows = new Map<string, ChatGeoState>();
  for (const row of r.by_state ?? []) {
    const slug = stateSlugFor(row.state);
    const key = slug ?? `?${row.state.trim().toLowerCase()}`;
    const existing = stateRows.get(key);
    if (existing) {
      existing.sessions += Number(row.sessions);
      existing.messages += Number(row.messages);
    } else {
      stateRows.set(key, {
        slug,
        name: slug ? STATE_BY_SLUG.get(slug)!.name : titleCase(row.state),
        sessions: Number(row.sessions),
        messages: Number(row.messages),
      });
    }
  }
  const states = [...stateRows.values()].sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));

  // Cities: merge case and spacing variants within the same state.
  const cityRows = new Map<string, ChatGeoCity>();
  for (const row of r.by_city ?? []) {
    const country = row.country ?? null;
    const stateSlug = country === 'IN' || !country ? stateSlugFor(row.state) : null;
    const key = `${cityKey(row.city)}|${stateSlug ?? row.state ?? ''}|${country ?? ''}`;
    const existing = cityRows.get(key);
    if (existing) {
      existing.sessions += Number(row.sessions);
      continue;
    }
    const region = stateSlug
      ? STATE_BY_SLUG.get(stateSlug)!.name
      : country && country !== 'IN'
        ? countryName(country)
        : row.state
          ? titleCase(row.state)
          : null;
    cityRows.set(key, {
      city: titleCase(row.city),
      region,
      stateSlug,
      country,
      sessions: Number(row.sessions),
    });
  }
  const cities = [...cityRows.values()].sort((a, b) => b.sessions - a.sessions || a.city.localeCompare(b.city));

  const countries = (r.by_country ?? []).map((c) => ({
    code: c.country,
    name: countryName(c.country),
    sessions: Number(c.sessions),
  }));

  return {
    totals: {
      sessions,
      messages: Number(r.total_messages ?? 0),
      located,
      india: Number(r.india_sessions ?? 0),
      abroad: Number(r.abroad_sessions ?? 0),
      indiaNoState: Number(r.india_no_state_sessions ?? 0),
      unknown: Math.max(0, sessions - located),
    },
    states,
    cities,
    countries,
    trackingSince: r.tracking_since ?? null,
  };
}
