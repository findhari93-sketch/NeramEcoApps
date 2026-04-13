// ArchIndex — Neram's proprietary 0-100 college rating
// Weights: Studio 25%, Faculty 20%, Placement 20%, Infra 15%, Satisfaction 10%, Alumni 10%

import { ARCH_INDEX_CONFIG } from './constants';
import type { ArchIndexBreakdown, CollegeInfrastructure, CollegePlacement, CollegeFaculty } from './types';

export interface ArchIndexInputs {
  // Studio quality (0-100)
  studioScore?: number;
  designStudios?: number;
  studioStudentRatio?: string;
  hasDigitalFabrication?: boolean;
  hasModelMakingLab?: boolean;
  hasMaterialLibrary?: boolean;

  // Faculty strength (0-100)
  facultyScore?: number;
  facultyList?: CollegeFaculty[];
  totalFaculty?: number;
  practicingArchitectsCount?: number;

  // Placement (0-100)
  placementScore?: number;
  latestPlacement?: CollegePlacement | null;

  // Infrastructure (0-100)
  infraScore?: number;
  infrastructure?: CollegeInfrastructure | null;

  // Student satisfaction (0-100)
  satisfactionScore?: number;
  reviewRatingAvg?: number;

  // Alumni (0-100)
  alumniScore?: number;
  notableAlumniCount?: number;
}

// ─── Individual dimension calculators ────────────────────────────────────────

export function calcStudioScore(inputs: ArchIndexInputs): number {
  if (inputs.studioScore !== undefined) return clamp(inputs.studioScore);

  let score = 50; // base
  const infra = inputs.infrastructure;
  if (!infra) return score;

  if (infra.design_studios && infra.design_studios >= 3) score += 15;
  else if (infra.design_studios && infra.design_studios >= 1) score += 7;

  if (infra.has_digital_fabrication) score += 15;
  if (infra.has_model_making_lab) score += 10;
  if (infra.has_material_library) score += 10;

  // Studio:student ratio (lower is better) e.g. "1:15" → 15 students per studio
  if (infra.studio_student_ratio) {
    const ratio = parseRatio(infra.studio_student_ratio);
    if (ratio !== null) {
      if (ratio <= 10) score += 10;
      else if (ratio <= 20) score += 5;
      else score -= 5;
    }
  }

  return clamp(score);
}

export function calcFacultyScore(inputs: ArchIndexInputs): number {
  if (inputs.facultyScore !== undefined) return clamp(inputs.facultyScore);

  const faculty = inputs.facultyList ?? [];
  if (faculty.length === 0) return 40; // unknown → below average

  let score = 50;
  const total = faculty.length;
  const practicing = faculty.filter((f) => f.is_practicing_architect).length;
  const practicingRatio = total > 0 ? practicing / total : 0;

  // Ratio of practicing architects (industry experience is premium)
  if (practicingRatio >= 0.5) score += 20;
  else if (practicingRatio >= 0.3) score += 10;
  else if (practicingRatio >= 0.1) score += 5;

  // Faculty count relative to seats (rough student:faculty ratio)
  if (total >= 15) score += 10;
  else if (total >= 8) score += 5;

  return clamp(score);
}

export function calcPlacementScore(inputs: ArchIndexInputs): number {
  if (inputs.placementScore !== undefined) return clamp(inputs.placementScore);

  const p = inputs.latestPlacement;
  if (!p) return 30; // no data → low score

  let score = 0;

  // Placement rate (0-50 points)
  if (p.placement_rate_percent !== null) {
    score += Math.min(50, (p.placement_rate_percent / 100) * 50);
  }

  // Average package (0-30 points) — scaled at 5 LPA = 30 pts
  if (p.average_package_lpa !== null) {
    score += Math.min(30, (p.average_package_lpa / 5) * 30);
  }

  // Higher studies (0-20 points) — good sign for B.Arch
  if (p.higher_studies_percent !== null) {
    score += Math.min(20, (p.higher_studies_percent / 100) * 20);
  }

  return clamp(score);
}

export function calcInfraScore(inputs: ArchIndexInputs): number {
  if (inputs.infraScore !== undefined) return clamp(inputs.infraScore);

  const infra = inputs.infrastructure;
  if (!infra) return 35;

  let score = 40;
  if (infra.has_library) score += 5;
  if (infra.has_wifi) score += 5;
  if (infra.has_hostel_boys || infra.has_hostel_girls) score += 10;
  if (infra.has_mess) score += 5;
  if (infra.has_sports) score += 5;
  if (infra.has_digital_fabrication) score += 10;
  if (infra.has_model_making_lab) score += 10;
  if (infra.campus_area_acres && infra.campus_area_acres >= 10) score += 10;

  return clamp(score);
}

export function calcSatisfactionScore(inputs: ArchIndexInputs): number {
  if (inputs.satisfactionScore !== undefined) return clamp(inputs.satisfactionScore);

  // Scale Google/aggregated rating (0-5) → (0-100)
  if (inputs.reviewRatingAvg !== undefined) {
    return clamp((inputs.reviewRatingAvg / 5) * 100);
  }

  return 50; // unknown
}

export function calcAlumniScore(inputs: ArchIndexInputs): number {
  if (inputs.alumniScore !== undefined) return clamp(inputs.alumniScore);

  const notable = inputs.notableAlumniCount ?? 0;
  if (notable >= 10) return 90;
  if (notable >= 5) return 70;
  if (notable >= 1) return 50;
  return 30; // no data
}

// ─── Main calculator ─────────────────────────────────────────────────────────

export function calculateArchIndex(inputs: ArchIndexInputs): ArchIndexBreakdown {
  const studio = calcStudioScore(inputs);
  const faculty = calcFacultyScore(inputs);
  const placement = calcPlacementScore(inputs);
  const infrastructure = calcInfraScore(inputs);
  const satisfaction = calcSatisfactionScore(inputs);
  const alumni = calcAlumniScore(inputs);

  const total = Math.round(
    studio * ARCH_INDEX_CONFIG.studio.weight +
    faculty * ARCH_INDEX_CONFIG.faculty.weight +
    placement * ARCH_INDEX_CONFIG.placement.weight +
    infrastructure * ARCH_INDEX_CONFIG.infrastructure.weight +
    satisfaction * ARCH_INDEX_CONFIG.satisfaction.weight +
    alumni * ARCH_INDEX_CONFIG.alumni.weight
  );

  return { total: clamp(total), studio, faculty, placement, infrastructure, satisfaction, alumni };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function parseRatio(ratio: string): number | null {
  // "1:15" or "1:20"
  const parts = ratio.split(':');
  if (parts.length !== 2) return null;
  const denominator = parseFloat(parts[1]);
  return isNaN(denominator) ? null : denominator;
}

// ─── Display helpers ─────────────────────────────────────────────────────────

export function getArchIndexLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 65) return 'Very Good';
  if (score >= 50) return 'Good';
  if (score >= 35) return 'Average';
  return 'Below Average';
}

export function getArchIndexColor(score: number): string {
  if (score >= 80) return '#16a34a'; // green-600
  if (score >= 65) return '#2563eb'; // blue-600
  if (score >= 50) return '#d97706'; // amber-600
  if (score >= 35) return '#ea580c'; // orange-600
  return '#dc2626'; // red-600
}
