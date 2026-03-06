import type { Metadata, Viewport } from 'next';
import { Inter, Cormorant_Garamond, DM_Sans, Space_Mono } from 'next/font/google';
import { NeramThemeProvider, toolsAppLightTheme, toolsAppDarkTheme } from '@neram/ui';
import GoogleAdsTag from '@/components/GoogleAdsTag';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-cormorant',
});
const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
});
const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
});

export const metadata: Metadata = {
  title: {
    default: 'aiArchitek | Free NATA Preparation App — Cutoff Calculator, College Predictor & More',
    template: '%s | aiArchitek by Neram Classes',
  },
  description:
    'India\'s best free NATA preparation app by Neram Classes. AI-powered cutoff calculator, college predictor for 5000+ colleges, exam center finder, and community question bank. Install as PWA for offline study.',
  keywords:
    'NATA app, NATA preparation app, aiArchitek, NATA cutoff calculator, college predictor NATA, NATA exam centers, architecture entrance exam app, free NATA app, NATA 2026, best NATA app',
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
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: '/icon.svg',
  },
  openGraph: {
    title: 'aiArchitek — Free NATA Exam Preparation App',
    description:
      'AI-powered NATA preparation tools. Cutoff calculator, college predictor for 5000+ colleges, exam center locator. Used by 5000+ students.',
    type: 'website',
    url: 'https://app.neramclasses.com',
    siteName: 'aiArchitek by Neram Classes',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'aiArchitek — NATA Preparation App',
    description: 'Free NATA tools: cutoff calculator, college predictor, exam centers. By Neram Classes.',
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
    <html lang="en" className={`${inter.variable} ${cormorant.variable} ${dmSans.variable} ${spaceMono.variable}`}>
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
          lightTheme={toolsAppLightTheme}
          darkTheme={toolsAppDarkTheme}
          defaultMode="light"
        >
          {children}
        </NeramThemeProvider>
      </body>
    </html>
  );
}
