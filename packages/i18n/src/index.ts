/**
 * Neram Classes - Internationalization
 * 
 * Supports 5 languages:
 * - English (en) - Primary
 * - Tamil (ta)
 * - Hindi (hi)
 * - Kannada (kn)
 * - Malayalam (ml)
 */

// ============================================
// CONFIGURATION
// ============================================

export const locales = ['en', 'ta', 'hi', 'kn', 'ml'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const localeNames: Record<Locale, string> = {
  en: 'English',
  ta: 'தமிழ்',
  hi: 'हिन्दी',
  kn: 'ಕನ್ನಡ',
  ml: 'മലയാളം',
};

export const localeNamesInEnglish: Record<Locale, string> = {
  en: 'English',
  ta: 'Tamil',
  hi: 'Hindi',
  kn: 'Kannada',
  ml: 'Malayalam',
};

// Font families for each locale
export const localeFonts: Record<Locale, string> = {
  en: '"Poppins", "Inter", sans-serif',
  ta: '"Noto Sans Tamil", "Poppins", sans-serif',
  hi: '"Noto Sans Devanagari", "Poppins", sans-serif',
  kn: '"Noto Sans Kannada", "Poppins", sans-serif',
  ml: '"Noto Sans Malayalam", "Poppins", sans-serif',
};

// RTL support (all our languages are LTR)
export const localeDirections: Record<Locale, 'ltr' | 'rtl'> = {
  en: 'ltr',
  ta: 'ltr',
  hi: 'ltr',
  kn: 'ltr',
  ml: 'ltr',
};

// ============================================
// TYPES
// ============================================

export interface LocalizedContent<T = string> {
  en: T;
  ta?: T;
  hi?: T;
  kn?: T;
  ml?: T;
}

// ============================================
// UTILITIES
// ============================================

/**
 * Check if a locale is valid
 */
export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}

/**
 * Get locale from path or default
 */
export function getLocaleFromPath(pathname: string): Locale {
  const segments = pathname.split('/');
  const potentialLocale = segments[1];
  
  if (isValidLocale(potentialLocale)) {
    return potentialLocale;
  }
  
  return defaultLocale;
}

/**
 * Get localized content with fallback
 */
export function getLocalizedContent<T>(
  content: LocalizedContent<T>,
  locale: Locale
): T {
  return content[locale] ?? content.en;
}

/**
 * Create localized content object
 */
export function createLocalizedContent<T>(
  en: T,
  translations?: Partial<Omit<LocalizedContent<T>, 'en'>>
): LocalizedContent<T> {
  return {
    en,
    ...translations,
  };
}

/**
 * Get hreflang tags for SEO
 */
export function getHreflangTags(
  baseUrl: string,
  pathname: string
): Array<{ locale: Locale; url: string }> {
  // Remove locale prefix if present
  const cleanPath = pathname.replace(/^\/(en|ta|hi|kn|ml)/, '');
  
  return locales.map((locale) => ({
    locale,
    url: `${baseUrl}/${locale}${cleanPath}`,
  }));
}

/**
 * Format number according to locale
 */
export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions
): string {
  const localeMap: Record<Locale, string> = {
    en: 'en-IN',
    ta: 'ta-IN',
    hi: 'hi-IN',
    kn: 'kn-IN',
    ml: 'ml-IN',
  };
  
  return new Intl.NumberFormat(localeMap[locale], options).format(value);
}

/**
 * Format currency (INR) according to locale
 */
export function formatCurrency(
  value: number,
  locale: Locale
): string {
  return formatNumber(value, locale, {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });
}

/**
 * Format date according to locale
 */
export function formatDate(
  date: Date | string,
  locale: Locale,
  options?: Intl.DateTimeFormatOptions
): string {
  const localeMap: Record<Locale, string> = {
    en: 'en-IN',
    ta: 'ta-IN',
    hi: 'hi-IN',
    kn: 'kn-IN',
    ml: 'ml-IN',
  };
  
  const d = typeof date === 'string' ? new Date(date) : date;
  
  return new Intl.DateTimeFormat(localeMap[locale], {
    dateStyle: 'medium',
    ...options,
  }).format(d);
}

// ============================================
// NEXT-INTL CONFIGURATION
// ============================================

export const i18nConfig = {
  locales,
  defaultLocale,
  localePrefix: 'as-needed' as const,
};

// ============================================
// EXPORTS
// ============================================

export { default as enMessages } from './locales/en.json';
