import { describe, expect, it } from 'vitest';
import { INDIAN_CITIES } from '@neram/geo';
import { distinctCityName, sameNameAsState } from './city-names';
import { fitTitle } from '@/lib/seo/tool-metadata';

const city = (slug: string) => INDIAN_CITIES.find((c) => c.slug === slug)!;

describe('city names in tool page titles', () => {
  it('adds the state only when two cities share a name', () => {
    expect(distinctCityName(city('aurangabad-bihar'))).toBe('Aurangabad, Bihar');
    expect(distinctCityName(city('chennai'))).toBe('Chennai');
  });

  it('spots a city named like its state', () => {
    const delhi = INDIAN_CITIES.find((c) => c.stateSlug === 'delhi' && c.name === 'Delhi');
    expect(delhi && sameNameAsState(delhi)).toBe(true);
    expect(sameNameAsState(city('chennai'))).toBe(false);
  });

  it('falls back to the short title instead of cutting mid-word', () => {
    expect(fitTitle('Short title', 'S')).toBe('Short title');
    expect(fitTitle('NATA Exam Centre near Aurangabad, Maharashtra 2027: Nearest Test City', 'NATA 2027 Exam Centre near Aurangabad, Maharashtra')).toBe(
      'NATA 2027 Exam Centre near Aurangabad, Maharashtra',
    );
  });
});
