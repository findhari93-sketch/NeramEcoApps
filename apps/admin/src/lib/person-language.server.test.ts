import { describe, expect, it } from 'vitest';
import { guessLanguage } from './person-language.server';

describe('guessLanguage', () => {
  it('never guesses over a recorded language, English included', () => {
    expect(guessLanguage({ homeLanguage: 'english', state: 'Tamil Nadu' })).toBeNull();
    expect(guessLanguage({ homeLanguage: 'hindi', city: 'Chennai' })).toBeNull();
  });

  it('trusts the site language they picked first', () => {
    expect(guessLanguage({ locale: 'ta', state: 'Karnataka' })).toEqual({
      key: 'tamil',
      source: 'locale',
      from: 'their site language',
    });
  });

  it('then the state, in any common spelling', () => {
    expect(guessLanguage({ locale: 'en', state: 'Tamil Nadu' })).toMatchObject({ key: 'tamil', source: 'state', from: 'Tamil Nadu' });
    expect(guessLanguage({ state: 'TN' })?.key).toBe('tamil');
    expect(guessLanguage({ state: 'Pondicherry' })?.key).toBe('tamil');
    expect(guessLanguage({ state: 'Telangana' })?.key).toBe('telugu');
    expect(guessLanguage({ state: 'Kerala' })?.key).toBe('malayalam');
    expect(guessLanguage({ state: 'Uttar Pradesh' })?.key).toBe('hindi');
  });

  it('then the city, through its state', () => {
    expect(guessLanguage({ city: 'Chennai' })).toMatchObject({ key: 'tamil', source: 'city', from: 'Chennai' });
    expect(guessLanguage({ city: 'Hyderabad' })?.key).toBe('telugu');
    expect(guessLanguage({ city: 'Bengaluru' })?.key).toBe('kannada');
  });

  it('guesses nothing outside the six, abroad or with no place', () => {
    expect(guessLanguage({ state: 'Maharashtra' })).toBeNull();
    expect(guessLanguage({ city: 'Dubai' })).toBeNull();
    expect(guessLanguage({})).toBeNull();
  });
});
