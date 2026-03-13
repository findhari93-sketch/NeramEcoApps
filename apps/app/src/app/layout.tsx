import type { Metadata, Viewport } from 'next';
import { Inter, DM_Sans } from 'next/font/google';
import { NeramThemeProvider } from '@neram/ui';
import { enterpriseLightTheme, enterpriseDarkTheme } from '@/lib/theme';
import GoogleAdsTag from '@/components/GoogleAdsTag';
import './globals.css';

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-inter' });
const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://app.neramclasses.com'),
  title: {
    default: 'aiArchitek | From Cutoffs to Colleges — Your Architecture Exam Companion',
    template: '%s | aiArchitek by Neram Classes',
  },
  description:
    'From cutoffs to colleges — aiArchitek is your complete architecture exam companion. Free AI-powered cutoff calculator, college predictor for 5000+ colleges, exam center finder, and community question bank by Neram Classes.',
  keywords:
    'NATA, NATA 2026, NATA preparation, NATA app, NATA cutoff calculator, NATA college predictor, NATA rank predictor, NATA mock test, NATA previous year papers, JEE Paper 2, B.Arch entrance exam, B.Arch colleges, B.Arch admission, architecture entrance exam app, free NATA app, NATA coaching, NATA study material, TNEA, TNEA counselling, architecture colleges India, NATA drawing test, NATA exam centers, college predictor, cutoff calculator, Neram Classes, aiArchitek',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'aiArchitek',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  openGraph: {
    title: 'aiArchitek — From Cutoffs to Colleges',
    description:
      'Your complete architecture exam companion. AI-powered cutoff calculator, college predictor for 5000+ colleges, exam center locator. Used by 5000+ students.',
    type: 'website',
    url: 'https://app.neramclasses.com',
    siteName: 'aiArchitek by Neram Classes',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'aiArchitek — From Cutoffs to Colleges',
    description: 'Your architecture exam companion. Cutoff calculator, college predictor, exam centers & more. By Neram Classes.',
  },
  alternates: {
    canonical: 'https://app.neramclasses.com',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#060d1f',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${dmSans.variable}`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className={inter.className}>
        <GoogleAdsTag />
        <NeramThemeProvider
          lightTheme={enterpriseLightTheme}
          darkTheme={enterpriseDarkTheme}
          defaultMode="light"
        >
          {children}
        </NeramThemeProvider>
      </body>
    </html>
  );
}
