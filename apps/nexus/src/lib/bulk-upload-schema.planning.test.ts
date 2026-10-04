import { describe, it, expect } from 'vitest';
import { inferCategories, inferSectionKey, reconcileSection } from './bulk-upload-schema';

describe('the Planning section in uploads', () => {
  it('reads a "Planning" heading as planning, not aptitude', () => {
    // Before Paper 2B existed, every unknown heading fell through to aptitude.
    expect(inferSectionKey('Part III: Planning')).toBe('planning');
    expect(inferSectionKey('Planning Based Questions')).toBe('planning');
    expect(inferSectionKey('Aptitude Test')).toBe('aptitude');
    expect(inferSectionKey('Mathematics (MCQ)')).toBe('math_mcq');
  });

  it('tags planning questions with the planning topic', () => {
    expect(inferCategories('planning')).toEqual(['planning']);
  });

  it('keeps an MCQ in planning', () => {
    expect(reconcileSection('planning', 'MCQ')).toBe('planning');
  });
});
