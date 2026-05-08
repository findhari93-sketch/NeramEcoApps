import collegesData from './colleges.json';
import importantDatesData from './important-dates.json';
import eligibilityData from './eligibility.json';
import documentsData from './documents.json';
import reservationData from './reservation.json';
import feeConcessionData from './fee-concession.json';
import allotmentData from './allotment-process.json';
import faqsData from './faqs.json';
import akshayaData from './akshaya.json';
import {
  KERALA_DISTRICTS,
  KERALA_UNIVERSITIES,
  type KeralaCollege,
  type ImportantDate,
  type EligibilityData,
  type DocumentItem,
  type ReservationData,
  type FeeData,
  type AllotmentData,
  type Faq,
  type FaqCategory,
  type AkshayaCallout,
  type KeralaDistrict,
} from './schema';

export const colleges = collegesData as KeralaCollege[];
export const importantDates = importantDatesData as ImportantDate[];
export const eligibility = eligibilityData as EligibilityData;
export const documents = documentsData as DocumentItem[];
export const reservation = reservationData as ReservationData;
export const fees = feeConcessionData as FeeData;
export const allotment = allotmentData as AllotmentData;
export const faqs = faqsData as Faq[];
export const akshaya = akshayaData as AkshayaCallout;

export const totalSeats = colleges.reduce((sum, c) => sum + c.seats, 0);

export const districts = Array.from(
  new Set(colleges.map((c) => c.district)),
).sort() as KeralaDistrict[];

export const universities = Array.from(new Set(colleges.map((c) => c.university))).sort();

export function getCollegesByDistrict(district: string): KeralaCollege[] {
  if (!district) return colleges;
  return colleges.filter((c) => c.district === district);
}

export function getCollegesByUniversity(university: string): KeralaCollege[] {
  if (!university) return colleges;
  return colleges.filter((c) => c.university === university);
}

export function getFaqsByCategory(category: FaqCategory): Faq[] {
  return faqs.filter((f) => f.category === category);
}

export function getNextUpcomingDate(now: Date = new Date()): ImportantDate | null {
  const upcoming = importantDates
    .filter((d) => d.iso_date && new Date(d.iso_date) >= now)
    .sort((a, b) => {
      const aTs = a.iso_date ? new Date(a.iso_date).getTime() : Infinity;
      const bTs = b.iso_date ? new Date(b.iso_date).getTime() : Infinity;
      return aTs - bTs;
    });
  return upcoming[0] ?? null;
}

export {
  KERALA_DISTRICTS,
  KERALA_UNIVERSITIES,
  type KeralaCollege,
  type ImportantDate,
  type EligibilityData,
  type DocumentItem,
  type ReservationData,
  type FeeData,
  type AllotmentData,
  type Faq,
  type FaqCategory,
  type AkshayaCallout,
  type KeralaDistrict,
};
