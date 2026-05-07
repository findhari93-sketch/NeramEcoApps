import type {
  Tfc,
  ImportantDate,
  ReservationData,
  FeeData,
  DocumentItem,
  CounsellingData,
  EligibilityData,
  Faq,
  FaqCategory,
} from './schema';

import tfcsRaw from './tfcs.json';
import importantDatesRaw from './important-dates.json';
import reservationRaw from './reservation.json';
import feesRaw from './fee-concession.json';
import documentsRaw from './documents.json';
import counsellingRaw from './counselling-procedure.json';
import eligibilityRaw from './eligibility.json';
import faqsRaw from './faqs.json';

export const tfcs = tfcsRaw as Tfc[];
export const importantDates = importantDatesRaw as ImportantDate[];
export const reservation = reservationRaw as ReservationData;
export const fees = feesRaw as FeeData;
export const documents = documentsRaw as DocumentItem[];
export const counselling = counsellingRaw as CounsellingData;
export const eligibility = eligibilityRaw as EligibilityData;
export const faqs = faqsRaw as Faq[];

export const districts: string[] = Array.from(
  new Set(tfcs.map((t) => t.district)),
).sort();

export function getTfcsByDistrict(district: string): Tfc[] {
  const target = district.toLowerCase();
  return tfcs.filter((t) => t.district.toLowerCase() === target);
}

export function getFaqsByCategory(category: FaqCategory): Faq[] {
  return faqs.filter((f) => f.category === category);
}

export function getNextUpcomingDate(now: Date = new Date()): ImportantDate | null {
  const future = importantDates
    .filter((d): d is ImportantDate & { iso_date: string } => d.iso_date !== null)
    .map((d) => ({ ...d, ts: new Date(d.iso_date).getTime() }))
    .filter((d) => d.ts >= now.getTime())
    .sort((a, b) => a.ts - b.ts);
  return future[0] ?? null;
}

export type {
  Tfc,
  ImportantDate,
  ReservationData,
  FeeData,
  DocumentItem,
  CounsellingData,
  EligibilityData,
  Faq,
  FaqCategory,
} from './schema';
