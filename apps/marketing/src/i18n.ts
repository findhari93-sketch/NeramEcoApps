import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

// Supported locales
export const locales = ['en', 'ta', 'hi', 'kn', 'ml'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

// Locale labels for language switcher
export const localeLabels: Record<Locale, string> = {
  en: 'English',
  ta: 'தமிழ்',
  hi: 'हिन्दी',
  kn: 'ಕನ್ನಡ',
  ml: 'മലയാളം',
};

// Deep merge function to combine messages
function deepMerge(target: any, source: any): any {
  const output = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      output[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      output[key] = source[key];
    }
  }
  return output;
}

export default getRequestConfig(async ({ requestLocale }) => {
  // Get the locale from the request
  const locale = await requestLocale;

  // Validate that the incoming `locale` parameter is valid
  if (!locale || !locales.includes(locale as Locale)) notFound();

  // Always load English as the base (fallback)
  const englishMessages = (await import(`../messages/en.json`)).default;

  // If the locale is English, just return English messages
  if (locale === 'en') {
    return {
      locale,
      messages: englishMessages,
    };
  }

  // For other locales, merge with English (locale-specific overrides English)
  const localeMessages = (await import(`../messages/${locale}.json`)).default;
  const mergedMessages = deepMerge(englishMessages, localeMessages);

  return {
    locale,
    messages: mergedMessages,
  };
});
