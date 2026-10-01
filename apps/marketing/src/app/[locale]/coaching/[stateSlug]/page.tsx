import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { StateCoachingPage } from '@/components/coaching-location/StateCoachingPage';
import { STATES, citiesInState, getState } from '@/data/geo';
import { EXAMS, type ExamKey } from '@/lib/seo/exam-config';
import { loadGeoDatasets } from '@/lib/seo/location-data';
import { cityFactsFor, stateFactsFor, stateMetadata } from '@/lib/seo/location-pages';
import { parseCoachingStateSegment, stateCoachingSegment } from '@/lib/seo/state-coaching-slug';

/**
 * State coaching hubs for every state and union territory, for NATA
 * (/coaching/nata-coaching-in-{state}) and JEE Paper 2
 * (/coaching/jee-paper-2-coaching-in-{state}). The segment is the whole public
 * slug; see lib/seo/state-coaching-slug.ts for why the folder is not
 * nata-coaching-in-[state]. English only (non-English URLs 301 to English).
 */
export const revalidate = 86400;

// Anything under /coaching/ that is not a known state hub is a 404, not a blank page.
export const dynamicParams = false;

const EXAM_KEYS: ExamKey[] = ['nata', 'jee-paper-2'];

export function generateStaticParams() {
  return EXAM_KEYS.flatMap((exam) => STATES.map((s) => ({ locale: 'en', stateSlug: stateCoachingSegment(s.slug, exam) })));
}

interface PageProps {
  params: { locale: string; stateSlug: string };
}

function resolve(segment: string) {
  const parsed = parseCoachingStateSegment(segment);
  const state = parsed ? getState(parsed.stateSlug) : undefined;
  return parsed && state ? { exam: parsed.exam, state } : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const r = resolve(params.stateSlug);
  if (!r) return {};
  const { facts, gate } = stateFactsFor(r.exam, r.state, await loadGeoDatasets());
  return stateMetadata(facts, gate);
}

export default async function StateCoachingRoute({ params }: PageProps) {
  setRequestLocale(params.locale);
  const r = resolve(params.stateSlug);
  if (!r) notFound();

  const ds = await loadGeoDatasets();
  const { facts } = stateFactsFor(r.exam, r.state, ds);
  const exam = EXAMS[r.exam];
  const cities = citiesInState(r.state.slug).map((c) => {
    const place = { kind: 'india' as const, ...c };
    const { gate } = cityFactsFor(r.exam, place, ds);
    return { label: c.name, href: exam.cityPath(c.slug), hint: c.district && c.district !== c.name ? `${c.district} district` : undefined, indexed: gate.index };
  });
  const other: ExamKey = r.exam === 'nata' ? 'jee-paper-2' : 'nata';
  const sibling = { label: `${EXAMS[other].name} coaching in ${r.state.name}`, href: EXAMS[other].statePath(r.state.slug) };

  return <StateCoachingPage facts={facts} locale={params.locale} cities={cities} siblingExam={sibling} />;
}
