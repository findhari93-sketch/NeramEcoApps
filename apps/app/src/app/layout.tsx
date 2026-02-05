import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { NeramThemeProvider, toolsAppLightTheme, toolsAppDarkTheme } from '@neram/ui';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Neram Classes - Tools & Resources',
  description: 'NATA coaching tools, cutoff calculators, college predictors, and exam resources',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Neram Tools',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
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
