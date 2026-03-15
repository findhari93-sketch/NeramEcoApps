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
import { BroadcastBanner, ImportantDateBanner, StickyAchievementWidget } from '@/components/marketing-content';
import GoogleAdsTag from '@/components/GoogleAdsTag';
import '@/styles/globals.css';

// Font loading - reduced to 2-3 fonts for faster FCP on 3G
// Removed: Cormorant_Garamond, DM_Sans (→ Inter), Space_Mono (→ system monospace)
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-poppins',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-inter',
});

// Only loaded when locale is Tamil — conditional application in layout below
const notoSansTamil = Noto_Sans_Tamil({
  subsets: ['tamil'],
  weight: ['400', '500', '600', '700'],
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
      "India's top-rated NATA and JEE Paper 2 coaching institute. Expert IIT/NIT alumni faculty, comprehensive study materials, 99.9% success rate. Online and offline classes across Tamil Nadu, India & Gulf countries.",
    keywords:
      'NATA coaching, JEE Paper 2 coaching, architecture entrance exam, NATA preparation, best NATA coaching India, online NATA classes, NATA coaching Tamil Nadu, architecture entrance coaching',
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: '48x48' },
        { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
        { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
        { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
        { url: '/android-icon-192x192.png', sizes: '192x192', type: 'image/png' },
      ],
      apple: [
        { url: '/apple-icon-120x120.png', sizes: '120x120' },
        { url: '/apple-icon-152x152.png', sizes: '152x152' },
        { url: '/apple-icon-180x180.png', sizes: '180x180' },
      ],
    },
    alternates: {
      canonical: locale === 'en' ? baseUrl : `${baseUrl}/${locale}`,
      languages: {
        en: baseUrl,
        ta: `${baseUrl}/ta`,
        hi: `${baseUrl}/hi`,
        kn: `${baseUrl}/kn`,
        ml: `${baseUrl}/ml`,
        'x-default': baseUrl,
      },
    },
    openGraph: {
      siteName: 'Neram Classes',
      locale: locale === 'ta' ? 'ta_IN' : locale === 'hi' ? 'hi_IN' : locale === 'kn' ? 'kn_IN' : locale === 'ml' ? 'ml_IN' : 'en_IN',
      type: 'website',
      images: [
        {
          url: '/og-default.svg',
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
      className={`${poppins.variable} ${inter.variable}${locale === 'ta' ? ` ${notoSansTamil.variable}` : ''}`}
      suppressHydrationWarning
    >
      <head />
      <body className={inter.className} suppressHydrationWarning>
        <GoogleAdsTag />
        <NextIntlClientProvider messages={messages}>
          <ThemeRegistry
            options={{ key: 'neram-mui' }}
            lightTheme={marketingLightTheme}
            darkTheme={marketingDarkTheme}
            defaultMode="light"
          >
            <AuthProvider>
              <BroadcastBanner locale={locale} />
              <ImportantDateBanner locale={locale} />
              <Header />
              <main>{children}</main>
              <Footer />
              <StickyAchievementWidget locale={locale} />
            </AuthProvider>
          </ThemeRegistry>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
