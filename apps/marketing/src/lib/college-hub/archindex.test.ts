import { describe, it, expect } from 'vitest';
import {
  calculateArchIndex,
  calcStudioScore,
  calcPlacementScore,
  calcFacultyScore,
  getArchIndexLabel,
  getArchIndexColor,
} from './archindex';
import type { CollegeInfrastructure, CollegePlacement, CollegeFaculty } from './types';

describe('calculateArchIndex', () => {
  it('returns total between 0-100', () => {
    const result = calculateArchIndex({});
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
  });

  it('respects pre-computed dimension scores', () => {
    const result = calculateArchIndex({
      studioScore: 100,
      facultyScore: 100,
      placementScore: 100,
      infraScore: 100,
      satisfactionScore: 100,
      alumniScore: 100,
    });
    expect(result.total).toBe(100);
  });

  it('uses zero scores when all inputs are zero', () => {
    const result = calculateArchIndex({
      studioScore: 0,
      facultyScore: 0,
      placementScore: 0,
      infraScore: 0,
      satisfactionScore: 0,
      alumniScore: 0,
    });
    expect(result.total).toBe(0);
  });

  it('weights add up: 25+20+20+15+10+10 = 100%', () => {
    const result = calculateArchIndex({
      studioScore: 80,
      facultyScore: 80,
      placementScore: 80,
      infraScore: 80,
      satisfactionScore: 80,
      alumniScore: 80,
    });
    expect(result.total).toBe(80);
  });
});

describe('calcStudioScore', () => {
  it('returns base 50 when no infrastructure data', () => {
    expect(calcStudioScore({})).toBe(50);
  });

  it('adds bonus for digital fabrication + model making lab', () => {
    const infra = {
      has_digital_fabrication: true,
      has_model_making_lab: true,
      has_material_library: true,
      design_studios: 3,
    } as unknown as CollegeInfrastructure;
    const score = calcStudioScore({ infrastructure: infra });
    expect(score).toBeGreaterThan(80);
  });

  it('clamps at 100', () => {
    const infra = {
      has_digital_fabrication: true,
      has_model_making_lab: true,
      has_material_library: true,
      design_studios: 5,
      studio_student_ratio: '1:5',
    } as unknown as CollegeInfrastructure;
    const score = calcStudioScore({ infrastructure: infra });
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('calcPlacementScore', () => {
  it('returns 30 when no placement data', () => {
    expect(calcPlacementScore({ latestPlacement: null })).toBe(30);
  });

  it('scores 100% placement rate + 5 LPA avg correctly', () => {
    const placement = {
      placement_rate_percent: 100,
      average_package_lpa: 5,
      higher_studies_percent: 100,
    } as unknown as CollegePlacement;
    const score = calcPlacementScore({ latestPlacement: placement });
    expect(score).toBe(100);
  });

  it('scores partial placement correctly', () => {
    const placement = {
      placement_rate_percent: 50,
      average_package_lpa: 2.5,
      higher_studies_percent: 0,
    } as unknown as CollegePlacement;
    const score = calcPlacementScore({ latestPlacement: placement });
    expect(score).toBe(40); // 25 (placement) + 15 (package)
  });
});

describe('calcFacultyScore', () => {
  it('returns 40 when no faculty data', () => {
    expect(calcFacultyScore({ facultyList: [] })).toBe(40);
  });

  it('boosts score for high ratio of practicing architects', () => {
    const faculty: CollegeFaculty[] = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      college_id: '1',
      name: `Faculty ${i}`,
      designation: null,
      specialization: null,
      qualification: null,
      is_practicing_architect: i < 6, // 60%
      profile_url: null,
      display_order: i,
      is_active: true,
    }));
    const score = calcFacultyScore({ facultyList: faculty });
    expect(score).toBeGreaterThan(60);
  });
});

describe('getArchIndexLabel', () => {
  it('labels correctly', () => {
    expect(getArchIndexLabel(85)).toBe('Excellent');
    expect(getArchIndexLabel(70)).toBe('Very Good');
    expect(getArchIndexLabel(55)).toBe('Good');
    expect(getArchIndexLabel(40)).toBe('Average');
    expect(getArchIndexLabel(20)).toBe('Below Average');
  });
});

describe('getArchIndexColor', () => {
  it('returns green for high scores', () => {
    expect(getArchIndexColor(80)).toBe('#16a34a');
  });

  it('returns red for low scores', () => {
    expect(getArchIndexColor(20)).toBe('#dc2626');
  });
});
