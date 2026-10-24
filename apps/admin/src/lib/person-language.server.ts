/**
 * The language guess for someone nobody has recorded a language for.
 *
 * Order: the site language they picked (strongest: they chose it), then the
 * state they gave, then the city they gave. The first that points at one of our
 * six languages wins. English, a state outside the six, a Gulf city or nothing
 * at all gives no guess, and the avatar corner stays bare.
 *
 * Server-only: @neram/geo carries the whole city registry, which has no business
 * in the browser bundle (the same rule as chat-geo.ts).
 */
import { cityForName, getCity, getState } from '@neram/geo';
import { isLanguageValue } from '@neram/ui/language';
import { stateSlugFor } from './chat-geo';
import { STATE_LANGUAGE, languageFromLocale, type LanguageGuess } from './person-avatar';

export interface LanguageGuessInput {
  homeLanguage?: string | null;
  locale?: string | null;
  state?: string | null;
  city?: string | null;
}

/** Null when a language is already recorded, or when nothing points at one. */
export function guessLanguage({ homeLanguage, locale, state, city }: LanguageGuessInput): LanguageGuess | null {
  if (isLanguageValue(homeLanguage)) return null;

  const fromLocale = languageFromLocale(locale);
  if (fromLocale) return { key: fromLocale, source: 'locale', from: 'their site language' };

  const stateSlug = stateSlugFor(state);
  if (stateSlug && STATE_LANGUAGE[stateSlug]) {
    return { key: STATE_LANGUAGE[stateSlug], source: 'state', from: getState(stateSlug)?.name ?? state?.trim() ?? null };
  }

  const citySlug = cityForName(city, stateSlug);
  const place = citySlug ? getCity(citySlug) : undefined;
  if (place && place.kind === 'india' && STATE_LANGUAGE[place.stateSlug]) {
    return { key: STATE_LANGUAGE[place.stateSlug], source: 'city', from: place.name };
  }

  return null;
}
