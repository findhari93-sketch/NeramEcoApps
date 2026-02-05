import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { NeramThemeProvider, marketingLightTheme, marketingDarkTheme } from '@neram/ui';
import { locales } from '@/i18n';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AuthProvider from '@/components/AuthProvider';
import '@/styles/globals.css';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const metadata = {
  title: 'Neram Classes - Quality Education for All',
  description:
    'Premier educational institution offering comprehensive courses in academics and competitive exams',
};

export default async function RootLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  // Validate that the incoming `locale` parameter is valid
  if (!locales.includes(locale as any)) {
    notFound();
  }

  // Enable static rendering
  setRequestLocale(locale);

  // Providing all messages to the client
  // side is the easiest way to get started
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <meta name="emotion-insertion-point" content="" />
      </head>
      <body suppressHydrationWarning>
        <NextIntlClientProvider messages={messages}>
          <NeramThemeProvider
            lightTheme={marketingLightTheme}
            darkTheme={marketingDarkTheme}
            defaultMode="light"
          >
            <AuthProvider>
              <Header />
              <main>{children}</main>
              <Footer />
            </AuthProvider>
          </NeramThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
