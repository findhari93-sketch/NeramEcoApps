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
    `- NATA cutoff calculator: ${APP_URL}/tools/nata/cutoff-calculator`,
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
export function buildLlmsTxt(ds: GeoDatasets): string {
  const states = allStateGates('nata', ds).filter((s) => s.gate.index);
  return [
    ...header(),
    ...centres(ds.centres),
    ...mainPages(),
    '## NATA coaching by state',
    ...states.map(({ state }) => `- ${state.name}: ${U(EXAMS.nata.statePath(state.slug))}`),
    '',
    `For every city page, local B.Arch colleges and NATA test cities, see ${U('/llms-full.txt')}`,
    '',
  ].join('\n');
}

/** Full version: adds every indexed state and city with its answer, as the pages state it. */
export function buildLlmsFullTxt(ds: GeoDatasets): string {
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
  return out.join('\n');
}
