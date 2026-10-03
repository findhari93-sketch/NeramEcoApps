#!/usr/bin/env node
/**
 * Builds packages/geo/src/cities.generated.ts, the city registry behind
 * the "NATA coaching in {city}" pages. Run by hand; the output is committed.
 *
 *   1. Download GeoNames (CC BY 4.0, https://www.geonames.org) into a folder:
 *        cities5000.zip (unzip it), admin2Codes.txt
 *   2. node scripts/seo/build-geo-registry.mjs <geonames-folder>
 *
 * What it selects:
 *   - every Indian city already in packages/database/src/data/locations.ts (no URL is lost)
 *   - the seat town of every district (GeoNames PPLA/PPLA2/PPLC, else the most populous town)
 *   - every city of 250,000+ people
 * A candidate within SUBURB_KM of a larger selected city is treated as its suburb and skipped.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'packages/geo/src/cities.generated.ts');
const LEGACY = path.join(ROOT, 'packages/database/src/data/locations.ts');

const BIG_CITY_POP = 250_000;

/** A candidate this close to a larger selected city is its suburb, not a city page. */
function suburbRadiusKm(parentPop) {
  if (parentPop >= 2_500_000) return 30; // metros: Rohini, Ambattur, Kukatpally are localities
  if (parentPop >= 1_000_000) return 18;
  return 12;
}

// Satellite cities that are searched as places in their own right, kept even
// though they sit inside a metro's suburb radius. Key: `${stateSlug}:${GeoNames name}`.
const FORCE_INCLUDE = new Set([
  'maharashtra:Navi Mumbai', 'maharashtra:Thane', 'maharashtra:Pimpri-Chinchwad',
  'uttar-pradesh:Noida', 'uttar-pradesh:Ghaziabad', 'uttar-pradesh:Greater Noida',
  'haryana:Faridabad', 'haryana:Gurugram', 'west-bengal:Howrah', 'goa:Madgaon',
  'goa:Vasco da Gama', 'goa:Mapusa', 'goa:Panjim', 'telangana:Secunderabad', 'tamil-nadu:Tambaram',
  'kerala:Thrissur', 'odisha:Cuttack', 'punjab:Mohali', 'punjab:Sahibzada Ajit Singh Nagar',
  'karnataka:Manipal', 'uttarakhand:Roorkee', 'west-bengal:Kharagpur', 'odisha:Rourkela',
  'himachal-pradesh:Hamirpur', 'gujarat:Gandhinagar', 'chhattisgarh:Bhilai',
]);

// GeoNames names that are dated or unusual spellings of the name people search.
const NAME_FIXES = {
  Chanda: 'Chandrapur', Sholapur: 'Solapur', Shahjanpur: 'Shahjahanpur', Barddhaman: 'Bardhaman',
  Panjim: 'Panaji', Ramgundam: 'Ramagundam', Madgaon: 'Margao', 'Vasco da Gama': 'Vasco',
  Brahmapur: 'Berhampur', 'Sahibzada Ajit Singh Nagar': 'Mohali', Virudunagar: 'Virudhunagar',
  Bulandshahr: 'Bulandshahr', Gurgaon: 'Gurugram',
};

// GeoNames district names that differ from the spelling colleges and students use.
const DISTRICT_FIXES = {
  'Tirunelveli Kattabo': 'Tirunelveli', Kanniyakumari: 'Kanyakumari', Thoothukkudi: 'Thoothukudi',
  Ajitgarh: 'Mohali', Pattanamtitta: 'Pathanamthitta', Chamrajnagar: 'Chamarajanagar',
};

// GeoNames carries district totals as the town population for a few rows. Their
// population is treated as unknown so the tier is not inflated.
const DISTRUST_POPULATION = new Set(['Punasa', 'Nowrangapur', 'Bilimora', 'Kallakurichi', 'Kanayannur']);

// Legacy cities absent from cities5000 (coordinates from nata_exam_centers / GeoNames full dump).
const MANUAL_LEGACY = {
  dharwad: { lat: 15.4589, lng: 75.0078, district: 'Dharwad', geoName: 'Dharwad' },
};

const geoDir = process.argv[2];
if (!geoDir) {
  console.error('usage: node scripts/seo/build-geo-registry.mjs <geonames-folder>');
  process.exit(1);
}

// GeoNames admin1 code -> our state slug (matches colleges.state_slug).
const ADMIN1 = {
  '01': 'andaman-and-nicobar', '02': 'andhra-pradesh', '03': 'assam', '05': 'chandigarh',
  '07': 'delhi', '09': 'gujarat', '10': 'haryana', '11': 'himachal-pradesh',
  '12': 'jammu-and-kashmir', '13': 'kerala', '14': 'lakshadweep', '16': 'maharashtra',
  '17': 'manipur', '18': 'meghalaya', '19': 'karnataka', '20': 'nagaland', '21': 'odisha',
  '22': 'puducherry', '23': 'punjab', '24': 'rajasthan', '25': 'tamil-nadu', '26': 'tripura',
  '28': 'west-bengal', '29': 'sikkim', '30': 'arunachal-pradesh', '31': 'mizoram',
  '33': 'goa', '34': 'bihar', '35': 'madhya-pradesh', '36': 'uttar-pradesh',
  '37': 'chhattisgarh', '38': 'jharkhand', '39': 'uttarakhand', '40': 'telangana',
  '41': 'ladakh', '52': 'dadra-and-nagar-haveli-and-daman-and-diu',
};

// Legacy slugs whose GeoNames name differs. Value: the GeoNames name to look for.
const LEGACY_NAME_HINTS = {
  bangalore: 'Bengaluru', trichy: 'Tiruchirappalli', mysore: 'Mysuru', pondicherry: 'Puducherry',
  udhagamandalam: 'Ooty', hubli: 'Hubli', gulbarga: 'Kalaburagi', belgaum: 'Belgaum',
  shimoga: 'Shimoga', bellary: 'Bellary', tumkur: 'Tumkur', mangalore: 'Mangaluru',
  virudhunagar: 'Virudunagar', kodagu: 'Madikeri', visakhapatnam: 'Visakhapatnam',
  kallakurichi: 'Kallakurichi',
  thoothukudi: 'Thoothukudi', kochi: 'Kochi', trivandrum: 'Thiruvananthapuram',
  thiruvananthapuram: 'Thiruvananthapuram', calicut: 'Kozhikode', kozhikode: 'Kozhikode',
  vizag: 'Visakhapatnam', gurgaon: 'Gurugram', kanchipuram: 'Kanchipuram',
  chengalpattu: 'Chengalpattu', thiruvarur: 'Thiruvarur', viluppuram: 'Villupuram',
  tiruvallur: 'Tiruvallur', tirupattur: 'Tirupattur', mayiladuthurai: 'Mayiladuthurai',
  kallakurichi: 'Kallakkurichchi', ranipet: 'Ranipet', tenkasi: 'Tenkasi', delhi: 'New Delhi',
  chikmagalur: 'Chikmagalur', chikkamagaluru: 'Chikmagalur', davangere: 'Davangere',
  bijapur: 'Bijapur', vijayapura: 'Bijapur', karwar: 'Karwar', udupi: 'Udupi',
  madikeri: 'Madikeri', chitradurga: 'Chitradurga', hassan: 'Hassan', mandya: 'Mandya',
  kolar: 'Kolar', raichur: 'Raichur', bidar: 'Bidar', koppal: 'Koppal', gadag: 'Gadag',
  haveri: 'Haveri', bagalkot: 'Bagalkot', yadgir: 'Yadgir', chamarajanagar: 'Chamrajnagar',
  ramanagara: 'Ramanagaram', chikkaballapur: 'Chik Ballapur', dharwad: 'Dharwad',
  'vijayanagara': 'Hospet', 'hosapete': 'Hospet', kollam: 'Kollam', thrissur: 'Thrissur',
  kannur: 'Kannur', kottayam: 'Kottayam', palakkad: 'Palakkad', alappuzha: 'Alappuzha',
  malappuram: 'Malappuram', 'navi-mumbai': 'Navi Mumbai', allahabad: 'Prayagraj',
  prayagraj: 'Prayagraj', varanasi: 'Varanasi', vijayawada: 'Vijayawada',
};

// ── helpers ───────────────────────────────────────────────────────────────
const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z]/g, '');
const slugify = (s) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function km(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function tierFor(pop) {
  if (pop >= 3_000_000) return 1;
  if (pop >= 300_000) return 2;
  return 3;
}

// ── load GeoNames ─────────────────────────────────────────────────────────
const admin2 = new Map();
for (const line of fs.readFileSync(path.join(geoDir, 'admin2Codes.txt'), 'utf8').split('\n')) {
  const [code, , ascii] = line.split('\t');
  if (!code?.startsWith('IN.')) continue;
  const name = ascii.replace(/\s+district$/i, '').trim();
  admin2.set(code, DISTRICT_FIXES[name] ?? name);
}

const places = [];
for (const line of fs.readFileSync(path.join(geoDir, 'cities5000.txt'), 'utf8').split('\n')) {
  const f = line.split('\t');
  if (f[8] !== 'IN') continue;
  const stateSlug = ADMIN1[f[10]];
  if (!stateSlug) continue;
  places.push({
    id: f[0],
    name: f[2],
    alt: (f[3] || '').split(',').filter((a) => /^[\x20-\x7e]+$/.test(a)),
    lat: Number(f[4]),
    lng: Number(f[5]),
    fcode: f[7],
    admin1: f[10],
    admin2Key: f[11] ? `IN.${f[10]}.${f[11]}` : null,
    stateSlug,
    pop: DISTRUST_POPULATION.has(f[2]) ? 0 : Number(f[14]) || 0,
  });
}
const displayName = (geoName) => NAME_FIXES[geoName] ?? geoName;
const districtOf = (p) => (p.admin2Key ? admin2.get(p.admin2Key) ?? null : null);

// ── legacy cities (kept, with their slugs) ────────────────────────────────
const legacySrc = fs.readFileSync(LEGACY, 'utf8');
const legacy = [];
const re = /\{\s*city:\s*'([^']+)',\s*cityDisplay:\s*'([^']+)',\s*state:\s*'([^']+)',\s*stateDisplay:\s*'[^']*',\s*country:\s*'india'[^}]*sitemapPriority:\s*'(high|medium|low)'/g;
for (let m; (m = re.exec(legacySrc)); ) legacy.push({ slug: m[1], display: m[2].replace(/\s*\(.*\)$/, ''), stateSlug: m[3], priority: m[4] });

function findPlace(name, stateSlug) {
  const key = norm(name);
  const inState = places.filter((p) => p.stateSlug === stateSlug);
  const hits = inState.filter((p) => norm(p.name) === key || p.alt.some((a) => norm(a) === key));
  if (hits.length) return hits.sort((a, b) => b.pop - a.pop)[0];
  const loose = inState.filter((p) => norm(p.name).startsWith(key) || key.startsWith(norm(p.name)));
  return loose.sort((a, b) => b.pop - a.pop)[0] ?? null;
}

const selected = [];
const unmatched = [];
const usedSlugs = new Set();
const usedPlaceIds = new Set();

for (const l of legacy) {
  const manual = MANUAL_LEGACY[l.slug];
  if (manual) {
    usedSlugs.add(l.slug);
    selected.push({ slug: l.slug, name: l.display, stateSlug: l.stateSlug, population: 0, isDistrictHQ: true, legacy: true, ...manual });
    continue;
  }
  const hint = LEGACY_NAME_HINTS[l.slug];
  const p = (hint && findPlace(hint, l.stateSlug)) || findPlace(l.display, l.stateSlug) || findPlace(l.slug, l.stateSlug);
  if (!p) {
    unmatched.push(l);
    continue;
  }
  usedSlugs.add(l.slug);
  usedPlaceIds.add(p.id);
  selected.push({
    slug: l.slug,
    name: l.display,
    geoName: p.name,
    stateSlug: l.stateSlug,
    district: districtOf(p),
    lat: p.lat,
    lng: p.lng,
    population: p.pop,
    isDistrictHQ: /^PPL(A|A2|C)$/.test(p.fcode),
    legacy: true,
  });
}

// ── candidates: district seats + big cities ───────────────────────────────
const byDistrict = new Map();
for (const p of places) {
  if (!p.admin2Key) continue;
  const arr = byDistrict.get(p.admin2Key) ?? [];
  arr.push(p);
  byDistrict.set(p.admin2Key, arr);
}
const candidates = new Map();
for (const arr of byDistrict.values()) {
  const seats = arr.filter((p) => /^PPL(A|A2|C)$/.test(p.fcode));
  const pick = (seats.length ? seats : arr).sort((a, b) => b.pop - a.pop)[0];
  candidates.set(pick.id, { ...pick, seat: seats.length > 0 });
}
const forced = (p) => FORCE_INCLUDE.has(`${p.stateSlug}:${p.name}`);
for (const p of places) {
  if ((p.pop >= BIG_CITY_POP || forced(p)) && !candidates.has(p.id)) {
    candidates.set(p.id, { ...p, seat: /^PPL(A|A2|C)$/.test(p.fcode) });
  }
}

// Forced satellites first so a later, smaller suburb cannot claim their spot.
const sorted = [...candidates.values()].sort((a, b) => Number(forced(b)) - Number(forced(a)) || b.pop - a.pop);
const sameName = (s, c) =>
  s.stateSlug === c.stateSlug && [s.name, s.geoName].some((n) => n && norm(n) === norm(displayName(c.name)));
for (const c of sorted) {
  if (usedPlaceIds.has(c.id)) continue;
  // The same city under a second GeoNames row (seat and town rows share a name).
  if (selected.some((s) => sameName(s, c))) continue;
  // A suburb of a larger selected city (e.g. Ambattur near Chennai) is not its own page.
  if (!forced(c) && selected.some((s) => s.population >= c.pop && km(s, c) < suburbRadiusKm(s.population))) continue;
  const name = displayName(c.name);
  let slug = slugify(name);
  if (usedSlugs.has(slug)) slug = `${slug}-${c.stateSlug}`;
  if (usedSlugs.has(slug)) continue;
  usedSlugs.add(slug);
  usedPlaceIds.add(c.id);
  selected.push({
    slug,
    name,
    geoName: c.name,
    stateSlug: c.stateSlug,
    district: districtOf(c),
    lat: c.lat,
    lng: c.lng,
    population: c.pop,
    isDistrictHQ: c.seat,
    legacy: false,
  });
}

// ── write ──────────────────────────────────────────────────────────────────
selected.sort((a, b) => a.stateSlug.localeCompare(b.stateSlug) || b.population - a.population);
const rows = selected.map((c) => {
  const fields = [
    `slug: ${JSON.stringify(c.slug)}`,
    `name: ${JSON.stringify(c.name)}`,
    `stateSlug: ${JSON.stringify(c.stateSlug)}`,
    `district: ${JSON.stringify(c.district)}`,
    `lat: ${c.lat.toFixed(4)}`,
    `lng: ${c.lng.toFixed(4)}`,
    `population: ${c.population}`,
    `tier: ${tierFor(c.population)}`,
    `isDistrictHQ: ${c.isDistrictHQ}`,
  ];
  if (c.legacy) fields.push('legacy: true');
  if (c.geoName !== c.name) fields.push(`altNames: [${JSON.stringify(c.geoName)}]`);
  return `  { ${fields.join(', ')} },`;
});

const header = `/**
 * GENERATED by scripts/seo/build-geo-registry.mjs. Do not edit by hand; edit
 * the script and re-run it.
 *
 * Coordinates, populations and districts: GeoNames (https://www.geonames.org),
 * licensed CC BY 4.0.
 */
import type { GeoCity } from './types';

export const GENERATED_CITIES: GeoCity[] = [
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${header}${rows.join('\n')}\n];\n`);

// ── Gulf cities (kept from the legacy list, online coaching only) ─────────
const GULF_COUNTRY = {
  uae: { code: 'AE', name: 'United Arab Emirates' }, qatar: { code: 'QA', name: 'Qatar' },
  oman: { code: 'OM', name: 'Oman' }, 'saudi-arabia': { code: 'SA', name: 'Saudi Arabia' },
  kuwait: { code: 'KW', name: 'Kuwait' }, bahrain: { code: 'BH', name: 'Bahrain' },
};
const GULF_NAME_HINTS = {
  makkah: 'Mecca', madinah: 'Medina', 'al-khobar': 'Al Khobar', 'kuwait-city': 'Kuwait City',
  seeb: 'Seeb', 'ras-al-khaimah': 'Ras al-Khaimah', 'al-wakrah': 'Al Wakrah', 'al-khor': 'Al Khawr',
  farwaniya: 'Al Farwaniyah', hawally: 'Hawalli', mangaf: 'Al Manqaf', riffa: 'Ar Rifa',
  muharraq: 'Al Muharraq', jubail: 'Al Jubayl', sur: 'Sur', yanbu: 'Yanbu',
};
const gulfPlaces = [];
const gulfCodes = new Set(Object.values(GULF_COUNTRY).map((g) => g.code));
for (const line of fs.readFileSync(path.join(geoDir, 'cities5000.txt'), 'utf8').split('\n')) {
  const f = line.split('\t');
  if (!gulfCodes.has(f[8])) continue;
  gulfPlaces.push({ name: f[2], alt: (f[3] || '').split(','), lat: Number(f[4]), lng: Number(f[5]), cc: f[8], pop: Number(f[14]) || 0 });
}
const gulfRe = /\{\s*city:\s*'([^']+)',\s*cityDisplay:\s*'([^']+)',\s*state:\s*'([^']+)',[^}]*region:\s*'gulf',\s*sitemapPriority:\s*'(high|medium|low)'/g;
const gulfRows = [];
const gulfUnmatched = [];
for (let m; (m = gulfRe.exec(legacySrc)); ) {
  const [, slug, display, countrySlug] = m;
  const country = GULF_COUNTRY[countrySlug];
  const want = [GULF_NAME_HINTS[slug], display].filter(Boolean).map(norm);
  const hit = gulfPlaces
    .filter((p) => p.cc === country.code && want.some((w) => norm(p.name) === w || p.alt.some((a) => norm(a) === w)))
    .sort((a, b) => b.pop - a.pop)[0];
  if (!hit) {
    gulfUnmatched.push(slug);
    continue;
  }
  gulfRows.push(
    `  { slug: ${JSON.stringify(slug)}, name: ${JSON.stringify(display)}, countrySlug: ${JSON.stringify(countrySlug)}, countryName: ${JSON.stringify(country.name)}, lat: ${hit.lat.toFixed(4)}, lng: ${hit.lng.toFixed(4)}, population: ${hit.pop} },`,
  );
}
const GULF_OUT = path.join(path.dirname(OUT), 'gulf-cities.generated.ts');
fs.writeFileSync(
  GULF_OUT,
  `/**\n * GENERATED by scripts/seo/build-geo-registry.mjs. Coordinates: GeoNames, CC BY 4.0.\n */\nimport type { GulfCity } from './types';\n\nexport const GULF_CITIES: GulfCity[] = [\n${gulfRows.join('\n')}\n];\n`,
);
console.log(`wrote ${gulfRows.length} Gulf cities`);
if (gulfUnmatched.length) {
  console.log(`UNMATCHED Gulf cities: ${gulfUnmatched.join(', ')} (add GULF_NAME_HINTS)`);
  process.exitCode = 2;
}

const byState = {};
for (const c of selected) byState[c.stateSlug] = (byState[c.stateSlug] ?? 0) + 1;
console.log(`wrote ${selected.length} cities (${selected.filter((c) => c.legacy).length} legacy) to ${path.relative(ROOT, OUT)}`);
console.log('tiers:', [1, 2, 3].map((t) => `${t}=${selected.filter((c) => tierFor(c.population) === t).length}`).join(' '));
console.log('by state:', byState);
if (unmatched.length) {
  console.log(`UNMATCHED legacy cities (${unmatched.length}), add a LEGACY_NAME_HINTS entry:`);
  for (const u of unmatched) console.log(`  ${u.slug} (${u.display}, ${u.stateSlug})`);
  process.exitCode = 2;
}
