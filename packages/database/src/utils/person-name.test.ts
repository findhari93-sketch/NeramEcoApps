import { describe, expect, it } from 'vitest';
import { fullestName, surnameFrom } from './person-name';

describe('surnameFrom', () => {
  it('takes the family name written before the given name', () => {
    expect(surnameFrom('Radhika', ['Radhika', 'Kunisetty Radhika'])).toBe('Kunisetty');
  });

  it('takes the family name written after the given name', () => {
    expect(surnameFrom('Hansa', ['Hansa Shajahan'])).toBe('Shajahan');
  });

  it('ignores a candidate without the first name, such as a parent', () => {
    expect(surnameFrom('Radhika', ['Kunisetty Bhanuprakash'])).toBeNull();
  });

  it('matches the first name without caring about case', () => {
    expect(surnameFrom('radhika', ['KUNISETTY RADHIKA'])).toBe('KUNISETTY');
  });

  it('keeps the fullest candidate', () => {
    expect(surnameFrom('Aisha', ['Aisha K', 'Aisha Eshal Khan'])).toBe('Eshal Khan');
  });

  it('never repeats a word the first name already holds', () => {
    expect(surnameFrom('Jeshurun Winsley B', ['Jeshurun Winsley'])).toBeNull();
    expect(surnameFrom('Jeshurun Winsley', ['Jeshurun Winsley Benjamin'])).toBe('Benjamin');
  });

  it('is null when nothing beyond the first name is known', () => {
    expect(surnameFrom('Radhika', ['Radhika', null, ''])).toBeNull();
    expect(surnameFrom('', ['Kunisetty Radhika'])).toBeNull();
  });
});

describe('fullestName', () => {
  it('keeps the full name over the first name', () => {
    expect(fullestName('Radhika', ['Kunisetty Radhika'])).toBe('Kunisetty Radhika');
  });

  it('keeps a full name the student typed', () => {
    expect(fullestName('Hansa Shajahan', ['Hansa'])).toBe('Hansa Shajahan');
  });

  it('never takes a name that is not theirs', () => {
    expect(fullestName('Radhika', ['Kunisetty Bhanuprakash'])).toBe('Radhika');
  });
});
