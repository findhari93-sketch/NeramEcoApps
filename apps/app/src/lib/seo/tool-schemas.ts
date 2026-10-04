/**
 * Structured data for the public tool pages. Only what is true and visible on
 * the page: no ratings, no reviews, FAQ only when the FAQ is shown.
 */
import { APP_URL, MARKETING_URL, ORG_NAME } from './constants';

export interface Crumb {
  name: string;
  /** Path on this site, e.g. "/tools". */
  path: string;
}

export const absoluteUrl = (path: string) => (path.startsWith('http') ? path : `${APP_URL}${path}`);

export function breadcrumbSchema(crumbs: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}

export function faqSchema(faqs: Array<{ q: string; a: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

export function webApplicationSchema(opts: { name: string; description: string; path: string; features: string[] }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: opts.name,
    description: opts.description,
    url: absoluteUrl(opts.path),
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Any (web browser)',
    isAccessibleForFree: true,
    inLanguage: 'en-IN',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
    featureList: opts.features,
    provider: { '@type': 'EducationalOrganization', name: ORG_NAME, url: MARKETING_URL },
  };
}

export interface ListItemInput {
  name: string;
  /** Absolute or site path; omitted when the item has no page of its own. */
  url?: string;
  /** Extra schema fields for the item, e.g. { '@type': 'Place', address: ... }. */
  item?: Record<string, unknown>;
}

export function itemListSchema(name: string, items: ListItemInput[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      ...(it.url ? { url: absoluteUrl(it.url) } : {}),
      ...(it.item ? { item: { name: it.name, ...it.item } } : {}),
    })),
  };
}

export function datasetSchema(opts: {
  name: string;
  description: string;
  path: string;
  dateModified?: string;
  temporalCoverage?: string;
  spatialCoverage?: string;
  isBasedOn?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: opts.name,
    description: opts.description,
    url: absoluteUrl(opts.path),
    creator: { '@type': 'Organization', name: ORG_NAME, url: MARKETING_URL },
    isAccessibleForFree: true,
    ...(opts.dateModified ? { dateModified: opts.dateModified } : {}),
    ...(opts.temporalCoverage ? { temporalCoverage: opts.temporalCoverage } : {}),
    ...(opts.spatialCoverage ? { spatialCoverage: { '@type': 'Place', name: opts.spatialCoverage } } : {}),
    ...(opts.isBasedOn ? { isBasedOn: opts.isBasedOn } : {}),
  };
}
