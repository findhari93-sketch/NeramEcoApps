import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { NeramThemeProvider, toolsAppLightTheme, toolsAppDarkTheme } from '@neram/ui';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'Neram - Free NATA Study App | Cutoff Calculator, College Predictor & More',
    template: '%s | Neram NATA App',
  },
  description:
    'Free NATA preparation app by Neram Classes. Use our cutoff calculator, college predictor (5000+ colleges), and exam center locator. Install as PWA for offline NATA study. Best app for NATA exam preparation 2026.',
  keywords:
    'NATA app, NATA preparation app, NATA study app, free NATA app, NATA cutoff calculator app, college predictor NATA, NATA exam app, best NATA app, NATA practice app, architecture entrance exam app',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Neram NATA App',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/icon.svg',
  },
  openGraph: {
    title: 'Neram - Free NATA Exam Preparation App',
    description:
      'Best free app for NATA preparation. Cutoff calculator, college predictor for 5000+ colleges, exam center locator. Used by 5000+ students.',
    type: 'website',
    url: 'https://app.neramclasses.com',
    siteName: 'Neram NATA App',
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
  themeColor: '#1A73E8', // Material 3 primary blue
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className={inter.className}>
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
