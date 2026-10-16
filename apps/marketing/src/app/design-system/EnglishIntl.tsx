'use client';

import { NextIntlClientProvider } from 'next-intl';

/**
 * Client-side provider so design-system components (which use the
 * locale-aware Link) work here. The server NextIntlClientProvider would run
 * the [locale] request config, which 404s outside a locale segment.
 */
export default function EnglishIntl({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={{}} timeZone="Asia/Kolkata">
      {children}
    </NextIntlClientProvider>
  );
}
