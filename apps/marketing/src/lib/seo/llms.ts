/**
 * llms.txt and llms-full.txt, built from the same facts, gate and copy the
 * pages use, so what AI assistants read can never drift from the site (the old
 * static files still claimed "99.9%", "4.8/5 from 2500+ reviews" and linked
 * redirected URLs). Only canonical, indexed URLs are listed.
 */
import { STATES } from '@/data/geo';
import { COURSE_FEES } from '@/lib/fees';
import { APP_URL } from './constants';
import { EXAMS } from './exam-config';
import { ORG_FACTS, ORG_PROFILE, hasFullAddress, type ClassroomCentre } from './facts';
import { cityAnswer, hubNames, inr, stateAnswer } from './location-copy';
import type { GeoDatasets } from './location-facts';
import { allCityGates, allStateGates } from './location-pages';

const U = (path: string) => `${ORG_FACTS.url}${path}`;

/** The college fields the llms files list (one cached select, see college-hub/queries). */
export interface LlmsCollege {
  name: string;
  slug: string;
  state: string;
  state_slug: string | null;
  city: string | null;
  type: string | null;
  annual_fee_approx: number | null;
  total_barch_seats: number | null;
  counseling_systems: string[] | null;
}

const collegeUrl = (c: Pick<LlmsCollege, 'slug' | 'state_slug'>) => U(`/colleges/${c.state_slug ?? 'india'}/${c.slug}`);

const titleCase = (s: string) => s.trim().toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());

/** "- [Name](url): city, type, ₹1,50,000/yr, 60 seats, TNEA". Missing facts are skipped. */
export function collegeLine(c: LlmsCollege): string {
  const systems = (c.counseling_systems ?? []).filter((s) => s && s.toLowerCase() !== 'other').map((s) => s.replace(/_/g, ' '));
  const facts = [
    c.city?.trim() || null,
    c.type ? titleCase(c.type) : null,
    c.annual_fee_approx ? `${inr(c.annual_fee_approx)}/yr` : null,
    c.total_barch_seats ? `${c.total_barch_seats} seats` : null,
    systems.length ? systems.join(', ') : null,
  ].filter(Boolean);
  return `- [${c.name}](${collegeUrl(c)})${facts.length ? `: ${facts.join(', ')}` : ''}`;
}

/** States that have a /colleges/{state} hub, alphabetical. */
function collegeStates(colleges: LlmsCollege[]): Array<{ slug: string; name: string; count: number }> {
  const m = new Map<string, { slug: string; name: string; count: number }>();
  for (const c of colleges) {
    if (!c.state_slug) continue;
    const e = m.get(c.state_slug);
    if (e) e.count++;
    else m.set(c.state_slug, { slug: c.state_slug, name: c.state, count: 1 });
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** "## B.Arch colleges in India", grouped by state, one line per college. */
export function collegeDirectory(colleges: LlmsCollege[]): string[] {
  if (!colleges.length) return [];
  const out = ['## B.Arch colleges in India', ''];
  for (const st of collegeStates(colleges)) {
    out.push(`### ${st.name}`, U(`/colleges/${st.slug}`));
    const inState = colleges.filter((c) => c.state_slug === st.slug).sort((a, b) => a.name.localeCompare(b.name));
    for (const c of inState) out.push(collegeLine(c));
    out.push('');
  }
  return out;
}

function header(): string[] {
  return [
    `# ${ORG_FACTS.name}`,
    '',
    `> ${ORG_PROFILE}`,
    '',
    '## Key facts',
    `- Founded: ${ORG_FACTS.foundingYear}, by ${ORG_FACTS.founder} (${ORG_FACTS.founderCredential})`,
    `- Exams taught: ${ORG_FACTS.exams.join(', ')}`,
    `- How students learn: ${ORG_FACTS.teachingModes}`,
    `- Head office: ${Object.values(ORG_FACTS.headOffice).slice(0, 4).join(', ')}`,
    `- Phone and WhatsApp: ${ORG_FACTS.phone}`,
    `- Email: ${ORG_FACTS.email}`,
    '',
    '## Fees',
    ...COURSE_FEES.map(
      (c) =>
        `- ${c.name} (${c.duration}): ${inr(c.price)}${c.singlePaymentPrice ? ` (${inr(c.singlePaymentPrice)} if paid at once)` : ''}`,
    ),
    `- Details: ${U('/fees')}`,
    '',
  ];
}

function centres(list: ClassroomCentre[]): string[] {
  if (!list.length) return [];
  return [
    '## Classroom centres',
    ...list.map(
      (c) =>
        `- ${c.name}: ${hasFullAddress(c) ? `${c.address}, ` : ''}${c.areaLabel}, ${c.state}${c.pincode ? ` ${c.pincode}` : ''}. ${U(EXAMS.nata.cityPath(c.citySlug))}`,
    ),
    '',
  ];
}

function mainPages(): string[] {
  return [
    '## Main pages',
    `- Online NATA coaching: ${U('/nata-online-coaching')}`,
    `- NATA coaching by state and city: ${U('/coaching/nata-coaching')}`,
    `- JEE Paper 2 (B.Arch) preparation: ${U('/jee-paper-2-preparation')}`,
    `- AAT (IIT B.Arch) 2026 guide: ${U('/aat-2026')}`,
    `- PGETA (M.Arch) 2026 guide: ${U('/pgeta-2026')}`,
    `- NATA 2026 guide: ${U('/nata-2026')}`,
    `- Courses: ${U('/courses')}`,
    `- Free demo class: ${U('/demo-class')}`,
    `- Apply: ${U('/apply')}`,
    '',
    '## Free tools',
    `- aiArchitek, the Neram AI-powered NATA platform (what each tool and AI feature does): ${U('/aiarchitek')}`,
    // The tools live on the app, which has a demo and state and city pages for each.
    `- NATA cutoff calculator, free with no login (12th marks out of 200 plus NATA out of 200, every board's real maximum, best of two attempts, real TNEA and KEAM closing marks): ${U('/tools/cutoff-calculator')}`,
    `- Full NATA cutoff calculator in the app (last year's score, saved results): ${APP_URL}/tools/nata/cutoff-calculator`,
    `- Ask Aintra in the aiArchitek app, a chat that answers NATA cutoff and B.Arch college questions from the official TNEA, KEAM and JoSAA allotment lists, with the source shown: ${APP_URL}/ask`,
    `- aiArchitek MCP connector for ChatGPT, Claude and other assistants (remote MCP server, no auth): ${APP_URL}/api/mcp, setup at ${APP_URL}/connect`,
    `- B.Arch college predictor: ${APP_URL}/tools/counseling/college-predictor`,
    `- NATA exam centre finder (every state and city): ${APP_URL}/tools/nata/exam-centers`,
    `- COA approved college checker: ${APP_URL}/tools/counseling/coa-checker`,
    `- All free tools, with a list of what each one answers: ${APP_URL}/llms.txt`,
    `- B.Arch college hub (fees, cutoffs, counselling): ${U('/colleges')}`,
    `- B.Arch counselling guides by state: ${U('/counseling')}`,
    '',
  ];
}

/** Short version: facts, main pages and the indexed state hubs. */
export function buildLlmsTxt(ds: GeoDatasets, colleges: LlmsCollege[] = []): string {
  const states = allStateGates('nata', ds).filter((s) => s.gate.index);
  const hubs = collegeStates(colleges);
  return [
    ...header(),
    ...centres(ds.centres),
    ...mainPages(),
    '## NATA coaching by state',
    ...states.map(({ state }) => `- ${state.name}: ${U(EXAMS.nata.statePath(state.slug))}`),
    '',
    ...(hubs.length
      ? ['## B.Arch colleges by state', ...hubs.map((h) => `- ${h.name} (${h.count} ${h.count === 1 ? "college" : "colleges"}): ${U(`/colleges/${h.slug}`)}`), '']
      : []),
    `For every city page, every B.Arch college, local colleges and NATA test cities, see ${U('/llms-full.txt')}`,
    '',
  ].join('\n');
}

/** Full version: adds every indexed state and city with its answer, as the pages state it. */
export function buildLlmsFullTxt(ds: GeoDatasets, colleges: LlmsCollege[] = []): string {
  const stateGates = new Map(allStateGates('nata', ds).map((s) => [s.state.slug, s]));
  const cities = allCityGates('nata', ds).filter((c) => c.gate.index);
  const out = [...header(), ...centres(ds.centres), ...mainPages(), '## NATA coaching by state and city', ''];

  for (const state of STATES) {
    const sg = stateGates.get(state.slug);
    if (!sg?.gate.index) continue;
    out.push(`### ${state.name}`, `${U(EXAMS.nata.statePath(state.slug))}`, stateAnswer(sg.facts).join(' '));
    const hubs = hubNames(state.counsellingHubs);
    if (hubs.length) out.push(`State B.Arch counselling: ${hubs.map((h) => (h.url ? `${h.name} (${U(h.url)})` : h.name)).join(', ')}`);
    const inState = cities.filter((c) => c.place.kind === 'india' && c.place.stateSlug === state.slug);
    for (const c of inState) out.push(`- ${c.place.name}: ${U(EXAMS.nata.cityPath(c.place.slug))}. ${cityAnswer(c.facts)[0]}`);
    out.push('');
  }

  const gulf = cities.filter((c) => c.place.kind === 'gulf');
  if (gulf.length) {
    out.push('### Gulf countries');
    for (const c of gulf) out.push(`- ${c.place.name}, ${c.facts.regionName}: ${U(EXAMS.nata.cityPath(c.place.slug))}`);
    out.push('');
  }
  out.push(...collegeDirectory(colleges));
  return out.join('\n');
}
