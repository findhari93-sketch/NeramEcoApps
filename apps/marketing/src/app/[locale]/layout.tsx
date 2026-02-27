import { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Poppins, Inter, Noto_Sans_Tamil } from 'next/font/google';
import { ThemeRegistry, marketingLightTheme, marketingDarkTheme } from '@neram/ui';
import { locales } from '@/i18n';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AuthProvider from '@/components/AuthProvider';
import '@/styles/globals.css';

// Font loading - Next.js preloads these automatically, eliminating font swap flash
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-poppins',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-inter',
});

const notoSansTamil = Noto_Sans_Tamil({
  subsets: ['tamil'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-noto-tamil',
});

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const baseUrl = 'https://neramclasses.com';

  return {
    metadataBase: new URL(baseUrl),
    title: {
      default: 'Neram Classes - Best NATA & JEE Paper 2 Coaching in India | Online & Offline',
      template: '%s | Neram Classes',
    },
    description:
      "India's top-rated NATA and JEE Paper 2 coaching institute. Expert IIT/NIT alumni faculty, comprehensive study materials, 95%+ success rate. Online and offline classes across Tamil Nadu, India & Gulf countries.",
    keywords:
      'NATA coaching, JEE Paper 2 coaching, architecture entrance exam, NATA preparation, best NATA coaching India, online NATA classes, NATA coaching Tamil Nadu, architecture entrance coaching',
    icons: {
      icon: '/favicon.ico',
    },
    alternates: {
      canonical: `${baseUrl}/${locale}`,
      languages: {
        en: `${baseUrl}/en`,
        ta: `${baseUrl}/ta`,
        hi: `${baseUrl}/hi`,
        kn: `${baseUrl}/kn`,
        ml: `${baseUrl}/ml`,
        'x-default': `${baseUrl}/en`,
      },
    },
    openGraph: {
      siteName: 'Neram Classes',
      locale: locale === 'ta' ? 'ta_IN' : locale === 'hi' ? 'hi_IN' : locale === 'kn' ? 'kn_IN' : locale === 'ml' ? 'ml_IN' : 'en_IN',
      type: 'website',
      images: [
        {
          url: '/og-default.png',
          width: 1200,
          height: 630,
          alt: 'Neram Classes - Best NATA & JEE Paper 2 Coaching in India',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@neramclasses',
      creator: '@neramclasses',
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    // TODO: Add verification codes when available
    // verification: {
    //   google: 'YOUR_GOOGLE_VERIFICATION_CODE',
    //   other: { 'msvalidate.01': 'YOUR_BING_VERIFICATION_CODE' },
    // },
  };
}

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
    <html
      lang={locale}
      className={`${poppins.variable} ${inter.variable} ${notoSansTamil.variable}`}
      suppressHydrationWarning
    >
      <head />
      <body className={inter.className} suppressHydrationWarning>
        <NextIntlClientProvider messages={messages}>
          <ThemeRegistry
            options={{ key: 'neram-mui' }}
            lightTheme={marketingLightTheme}
            darkTheme={marketingDarkTheme}
            defaultMode="light"
          >
            <AuthProvider>
              <Header />
              <main>{children}</main>
              <Footer />
            </AuthProvider>
          </ThemeRegistry>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
