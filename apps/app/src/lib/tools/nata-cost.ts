/**
 * The cost of sitting NATA: application fee, travel, a night's stay and
 * study materials. Shared by the full cost calculator and Aintra (Tools app) so
 * the two never give different totals. Travel and stay are estimates; the fee
 * is exact (lib/tools/nata-fees.ts).
 */
import { NATA_FEES } from './nata-fees';

/** States that usually have a NATA test city of their own (cheaper travel). */
export const MAJOR_EXAM_STATES = [
  'Delhi',
  'Maharashtra',
  'Karnataka',
  'Tamil Nadu',
  'West Bengal',
  'Telangana',
  'Uttar Pradesh',
  'Gujarat',
  'Rajasthan',
  'Kerala',
  'Madhya Pradesh',
  'Punjab',
  'Haryana',
  'Bihar',
  'Odisha',
  'Jharkhand',
  'Chhattisgarh',
  'Assam',
  'Chandigarh',
  'Uttarakhand',
  'Andhra Pradesh',
  'Goa',
];

export interface CostBreakdown {
  applicationFeePerAttempt: number;
  totalApplicationFee: number;
  estimatedTravel: number;
  travelNote: string;
  accommodation: number;
  accommodationNote: string;
  studyMaterials: { min: number; max: number };
  totalMin: number;
  totalMax: number;
}

export interface CostInput {
  /** A key of NATA_FEES, e.g. 'General/OBC(N-CL)'. Unknown means the General fee. */
  category: string;
  attempts: number;
  /** State name as in MAJOR_EXAM_STATES; empty when not given. */
  homeState: string;
  needAccommodation: boolean;
}

/** Case-insensitive state match, so "tamil nadu" from a chat still counts. */
function hasCentre(state: string): boolean {
  const s = state.trim().toLowerCase();
  return MAJOR_EXAM_STATES.some((m) => m.toLowerCase() === s);
}

export function estimateNataCost({ category, attempts, homeState, needAccommodation }: CostInput): CostBreakdown {
  const feePerAttempt = NATA_FEES[category] || NATA_FEES['General/OBC(N-CL)'];
  const numAttempts = Math.max(1, Math.min(3, Math.round(attempts) || 1));
  const totalFee = feePerAttempt * numAttempts;
  const state = homeState.trim();

  let estimatedTravel = 0;
  let travelNote = '';
  if (state && !hasCentre(state)) {
    estimatedTravel = 5000 * numAttempts;
    travelNote = `Your state (${state}) may not have a nearby exam center. Estimated travel cost per attempt: about ₹5,000`;
  } else if (state) {
    estimatedTravel = 2000 * numAttempts;
    travelNote = `Exam centers are likely available in or near ${state}. Estimated travel cost per attempt: about ₹2,000`;
  }

  let accommodation = 0;
  let accommodationNote = '';
  if (needAccommodation) {
    const perAttempt = state && !hasCentre(state) ? 3000 : 1500;
    accommodation = perAttempt * numAttempts;
    accommodationNote = `Estimated at ₹${perAttempt.toLocaleString('en-IN')} per attempt (1 to 2 nights)`;
  }

  const studyMaterials = { min: 2000, max: 5000 };
  return {
    applicationFeePerAttempt: feePerAttempt,
    totalApplicationFee: totalFee,
    estimatedTravel,
    travelNote,
    accommodation,
    accommodationNote,
    studyMaterials,
    totalMin: totalFee + estimatedTravel + accommodation + studyMaterials.min,
    totalMax: totalFee + estimatedTravel + accommodation + studyMaterials.max,
  };
}
