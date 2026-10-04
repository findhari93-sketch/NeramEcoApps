/**
 * Pure facts for the public tool pages and their place pages. No database, no
 * Next: the loaders hand rows in, these turn them into what a page shows and
 * what the index gate scores. Every row type here is aggregate or institutional
 * data; nothing about an individual student ever reaches this file.
 */
import {
  cityForName,
  getCity,
  haversineKm,
  roundKm,
  scoreGate,
  stateSlugForName,
  type GateResult,
  type GeoCity,
} from '@neram/geo';

// ─── Rows (as the loaders return them) ───────────────────────────────────

export interface CentreRow {
  city_brochure: string;
  state: string;
  latitude: number | string | null;
  longitude: number | string | null;
  confidence: string | null;
  tcs_ion_confirmed: boolean | null;
  probable_center_1: string | null;
  probable_center_2: string | null;
  is_new_2025: boolean | null;
  year: number | null;
  updated_at: string | null;
}

export interface Centre {
  label: string;
  stateSlug: string;
  citySlugs: string[];
  /** "A / B" rows and "periphery" rows have no single point to measure from. */
  isCombined: boolean;
  lat: number;
  lng: number;
  confirmed: boolean;
  venues: string[];
  isNew: boolean;
  year: number;
  updatedAt: string | null;
}

/** A college with published counselling cutoffs (TNEA marks or KEAM ranks). */
export interface CutoffCollege {
  system: 'TNEA_BARCH' | 'KEAM_BARCH';
  code: string;
  name: string;
  city: string | null;
  district: string | null;
  citySlug: string | null;
  stateSlug: string;
  year: number;
  /** TNEA: lowest aggregate mark (out of 400) allotted per category. */
  closingMarks?: Record<string, number>;
  /** KEAM: closing rank in State Merit. */
  closingRank?: number;
  seats?: number;
}

export interface CoaCollege {
  code: string;
  name: string;
  city: string;
  citySlug: string | null;
  stateSlug: string;
  intake: number | null;
  /** The approval period exactly as COA lists it, e.g. "2024-2025 & 2025-2026". */
  period: string | null;
  /** When the COA list was last read. */
  checkedAt: string | null;
  since: number | null;
  university: string | null;
}

export interface JosaaClosing {
  institute: string;
  type: string | null;
  state: string | null;
  city: string | null;
  quota: string;
  closingRank: number;
  year: number;
  round: number;
}

/** A college page on neramclasses.com, for cross-links only. */
export interface MarketingCollege {
  slug: string;
  name: string;
  city: string | null;
  /** colleges.city_slug: the key of neramclasses.com/colleges/city/{slug}. */
  cityPageSlug: string | null;
  district: string | null;
  stateSlug: string;
}

// ─── Exam centres ─────────────────────────────────────────────────────────

export function parseCentre(row: CentreRow): Centre | null {
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !row.city_brochure) return null;
  const label = row.city_brochure.replace(/\s*\((?:UAE|U\.A\.E\.)\)\s*/i, '').replace(/\s+District$/i, '').trim();
  const parts = label.split(/\s*\/\s*|\s+and\s+/i).map((p) => p.trim()).filter(Boolean);
  return {
    label,
    stateSlug: /international/i.test(row.state) ? 'international' : stateSlugForName(row.state),
    citySlugs: parts.map((p) => cityForName(p)).filter((s): s is string => s !== null),
    isCombined: parts.length > 1 || /periphery/i.test(label),
    lat,
    lng,
    confirmed: row.confidence === 'HIGH' || row.tcs_ion_confirmed === true,
    venues: [row.probable_center_1, row.probable_center_2].filter((v): v is string => !!v && v.trim().length > 0),
    isNew: row.is_new_2025 === true,
    year: row.year ?? 0,
    updatedAt: row.updated_at,
  };
}

export interface NearCentre {
  centre: Centre;
  /** 0 when the centre is in this city; null for combined rows elsewhere. */
  km: number | null;
  inThisCity: boolean;
}

/** Nearest Indian test cities to a place, nearest first. Combined rows count only when they name the place. */
export function nearestCentres(place: { slug: string; lat: number; lng: number }, centres: Centre[], n = 3): NearCentre[] {
  const out: NearCentre[] = [];
  for (const c of centres) {
    if (c.stateSlug === 'international') continue;
    const inThisCity = c.citySlugs.includes(place.slug);
    if (c.isCombined && !inThisCity) continue;
    out.push({ centre: c, inThisCity, km: inThisCity ? 0 : roundKm(haversineKm(place, c)) });
  }
  return out.sort((a, b) => Number(b.inThisCity) - Number(a.inThisCity) || (a.km ?? 1e9) - (b.km ?? 1e9)).slice(0, n);
}

export function centresInState(stateSlug: string, centres: Centre[]): Centre[] {
  return centres.filter((c) => c.stateSlug === stateSlug).sort((a, b) => a.label.localeCompare(b.label));
}

// ─── Colleges near a city ─────────────────────────────────────────────────

const key = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z]/g, '');

/** Colleges in this city, or failing that in its district (no coordinates exist for colleges). */
export function collegesNear<T extends { citySlug: string | null; district: string | null; stateSlug: string }>(
  city: GeoCity,
  colleges: T[]
): { inCity: T[]; inDistrict: T[] } {
  const inState = colleges.filter((c) => c.stateSlug === city.stateSlug);
  const inCity = inState.filter((c) => c.citySlug === city.slug);
  const district = key(city.district);
  const inDistrict = district
    ? inState.filter((c) => c.citySlug !== city.slug && key(c.district) === district)
    : [];
  return { inCity, inDistrict };
}

export function citySlugFor(name: string | null | undefined, stateSlug: string): string | null {
  const slug = cityForName(name ?? '');
  if (!slug) return null;
  const city = getCity(slug);
  return city && city.stateSlug === stateSlug ? slug : null;
}

// ─── Demo maths ───────────────────────────────────────────────────────────

/** TNEA: colleges whose closing mark in a category was at or below the student's mark, best first. */
export function tneaMatches(colleges: CutoffCollege[], mark: number, category = 'OC'): CutoffCollege[] {
  return colleges
    .filter((c) => c.closingMarks?.[category] != null && (c.closingMarks[category] as number) <= mark)
    .sort((a, b) => (b.closingMarks![category] as number) - (a.closingMarks![category] as number));
}

/** KEAM: colleges whose State Merit closing rank was at or after the student's rank, best first. */
export function keamMatches(colleges: CutoffCollege[], rank: number): CutoffCollege[] {
  return colleges
    .filter((c) => c.closingRank != null && c.closingRank >= rank)
    .sort((a, b) => (a.closingRank as number) - (b.closingRank as number));
}

/** JoSAA: institutes whose closing rank was at or after the student's rank, best first. */
export function josaaMatches(rows: JosaaClosing[], rank: number, quota: 'AI' | 'OS' = 'OS'): JosaaClosing[] {
  const pick = rows.filter((r) => (quota === 'OS' ? r.quota === 'OS' || r.quota === 'AI' : r.quota === quota));
  return pick.filter((r) => r.closingRank >= rank).sort((a, b) => a.closingRank - b.closingRank);
}

/** Split a result list into what a signed-out visitor sees and how many more there are. */
export function limitForDemo<T>(items: T[], free = 3): { shown: T[]; more: number } {
  return { shown: items.slice(0, free), more: Math.max(0, items.length - free) };
}

// ─── Index gates (see @neram/geo scoreGate: score >= 3 with a strong fact) ─

export const TOOL_GATE = {
  CENTRE_NEAR_KM: 25,
  CENTRE_REGION_KM: 75,
  /** A city further than this from every test city has nothing local to say. */
  CENTRE_HOPELESS_KM: 300,
} as const;

export function examCentreCityGate(city: GeoCity, near: NearCentre[], collegesInCityOrDistrict: number): GateResult {
  const first = near[0];
  const km = first ? first.km : null;
  return scoreGate([
    km !== null && km <= TOOL_GATE.CENTRE_NEAR_KM && { reason: 'centre-within-25km', strength: 'strong' },
    km !== null && km > TOOL_GATE.CENTRE_NEAR_KM && km <= TOOL_GATE.CENTRE_REGION_KM && city.tier <= 2 && { reason: 'centre-within-75km-big-city', strength: 'strong' },
    km !== null && km > TOOL_GATE.CENTRE_NEAR_KM && km <= TOOL_GATE.CENTRE_REGION_KM && city.tier > 2 && { reason: 'centre-within-75km', strength: 'weak' },
    near.filter((n) => n.km !== null && n.km <= 150).length >= 2 && { reason: 'two-centres-within-150km', strength: 'weak' },
    collegesInCityOrDistrict > 0 && { reason: 'barch-college-in-city-or-district', strength: 'weak' },
    city.isDistrictHQ && { reason: 'district-headquarters', strength: 'weak' },
  ]);
}

/** Cities with no test city within 300 km get no page at all (404), not a thin one. */
export function examCentreCityHasPage(near: NearCentre[]): boolean {
  const km = near[0]?.km;
  return km != null && km <= TOOL_GATE.CENTRE_HOPELESS_KM;
}

export function stateIndexedIf(count: number, min = 1): GateResult {
  return count >= min
    ? { index: true, score: 3, reasons: [`count-${count}`] }
    : { index: false, score: 0, reasons: ['no-local-data'] };
}

export function predictorCityGate(inCity: number, inDistrict: number, stateHasData: boolean): GateResult {
  return scoreGate([
    inCity > 0 && { reason: 'cutoff-college-in-city', strength: 'strong' },
    inCity === 0 && inDistrict > 0 && { reason: 'cutoff-college-in-district', strength: 'strong' },
    inCity + inDistrict >= 3 && { reason: 'three-or-more-nearby', strength: 'weak' },
    stateHasData && { reason: 'state-counselling-data', strength: 'weak' },
  ]);
}

export function coaCityGate(inCity: number): GateResult {
  return scoreGate([
    inCity >= 1 && { reason: 'coa-college-in-city', strength: 'strong' },
    inCity >= 2 && { reason: 'two-or-more-coa-colleges', strength: 'weak' },
    inCity >= 5 && { reason: 'five-or-more-coa-colleges', strength: 'weak' },
  ]);
}

// ─── Rank bands (score to counselling rank) ───────────────────────────────

/** Students in a 10-mark band and the ranks they got. Never single students. */
export interface RankBand {
  /** Inclusive lower mark of the band. */
  from: number;
  /** Exclusive upper mark. */
  to: number;
  bestRank: number;
  worstRank: number;
  count: number;
}

export interface SystemRanks {
  code: 'TNEA_BARCH' | 'KEAM_BARCH';
  year: number;
  total: number;
  bands: RankBand[];
}

/** Group rank-list rows into mark bands. Bands with fewer than 3 students merge into the next so no row stands alone. */
export function rankBands(rows: Array<{ rank: number | null; aggregate_mark: number | string | null }>, step = 10): RankBand[] {
  const byBand = new Map<number, RankBand>();
  for (const r of rows) {
    const mark = Number(r.aggregate_mark);
    if (r.rank == null || !Number.isFinite(mark)) continue;
    const from = Math.floor(mark / step) * step;
    const b = byBand.get(from) ?? { from, to: from + step, bestRank: r.rank, worstRank: r.rank, count: 0 };
    b.bestRank = Math.min(b.bestRank, r.rank);
    b.worstRank = Math.max(b.worstRank, r.rank);
    b.count++;
    byBand.set(from, b);
  }
  const sorted = [...byBand.values()].sort((a, b) => b.from - a.from);
  const merged: RankBand[] = [];
  for (const b of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.count < 3) {
      merged[merged.length - 1] = { from: b.from, to: last.to, bestRank: Math.min(last.bestRank, b.bestRank), worstRank: Math.max(last.worstRank, b.worstRank), count: last.count + b.count };
    } else merged.push(b);
  }
  // A small band left at the bottom joins the one above it.
  const tail = merged[merged.length - 1];
  if (merged.length > 1 && tail.count < 3) {
    const prev = merged[merged.length - 2];
    merged.splice(-2, 2, { from: tail.from, to: prev.to, bestRank: Math.min(prev.bestRank, tail.bestRank), worstRank: Math.max(prev.worstRank, tail.worstRank), count: prev.count + tail.count });
  }
  return merged;
}

/** The band a mark falls in, or the nearest band above/below the published range. */
export function bandForMark(bands: RankBand[], mark: number): RankBand | null {
  if (bands.length === 0 || !Number.isFinite(mark)) return null;
  return bands.find((b) => mark >= b.from && mark < b.to) ?? (mark >= bands[0].to ? bands[0] : bands[bands.length - 1]);
}
