import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { pickMessages } from '@/lib/i18n/client-messages';

/**
 * Server component: gives the client components below it only the listed
 * translation namespaces (see lib/i18n/client-messages.ts). It replaces the
 * layout's messages for this subtree, so list every namespace used below.
 */
export default async function ClientIntl({
  locale,
  namespaces,
  children,
}: {
  locale: string;
  namespaces: readonly string[];
  children: React.ReactNode;
}) {
  // Keeps the page static: the locale comes from params, never from headers.
  setRequestLocale(locale);
  const messages = await getMessages({ locale });
  return (
    <NextIntlClientProvider locale={locale} messages={pickMessages(messages, namespaces)}>
      {children}
    </NextIntlClientProvider>
  );
}
