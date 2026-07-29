import { describe, it, expect } from 'vitest';
import { categoryForSubjectSlugs, examForTagSlugs } from './class-library-bridge';

describe('categoryForSubjectSlugs', () => {
  it('returns a Library category slug, never a human label', () => {
    // The regression this guards: the bridge used to write the tag LABEL
    // ("Drawing"), while the chips and CategoryRow query the slug ("drawing"),
    // so every wrapped-up recording landed in a category nothing matched.
    const category = categoryForSubjectSlugs(['drawing']);
    expect(category).toBe('drawing');
    expect(category).not.toBe('Drawing');
  });

  it('rolls a fine-grained subject up to its parent category', () => {
    expect(categoryForSubjectSlugs(['perspective'])).toBe('drawing');
    expect(categoryForSubjectSlugs(['orthographic_projection'])).toBe('drawing');
    expect(categoryForSubjectSlugs(['mirror_image'])).toBe('aptitude');
    expect(categoryForSubjectSlugs(['embedded_figure'])).toBe('aptitude');
  });

  it('treats unmapped seeded subjects as mathematics', () => {
    // Every remaining seeded subject slug is a JEE maths chapter.
    expect(categoryForSubjectSlugs(['trigonometry'])).toBe('mathematics');
    expect(categoryForSubjectSlugs(['conic_sections'])).toBe('mathematics');
  });

  it('takes the first mapped subject when a class carries several', () => {
    expect(categoryForSubjectSlugs(['perspective', 'aptitude'])).toBe('drawing');
    expect(categoryForSubjectSlugs(['aptitude', 'perspective'])).toBe('aptitude');
  });

  it('returns null when the class has no subject tags', () => {
    expect(categoryForSubjectSlugs([])).toBeNull();
  });
});

describe('examForTagSlugs', () => {
  it('maps a single exam tag to the Library enum', () => {
    expect(examForTagSlugs(['nata'])).toBe('nata');
    expect(examForTagSlugs(['jee'])).toBe('jee_barch');
  });

  it('collapses both exams to "both"', () => {
    expect(examForTagSlugs(['nata', 'jee'])).toBe('both');
  });

  it('returns null rather than guessing when no exam tag is set', () => {
    // Null leaves library_videos.exam untouched. Guessing "general" here would
    // hide the video behind the wrong filter chip.
    expect(examForTagSlugs([])).toBeNull();
    expect(examForTagSlugs(['drawing'])).toBeNull();
  });
});
