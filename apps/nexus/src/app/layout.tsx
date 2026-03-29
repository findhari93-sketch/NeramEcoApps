import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { NeramThemeProvider, nexusLightTheme, nexusDarkTheme } from '@neram/ui';
import Providers from './providers';
import 'katex/dist/katex.min.css';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Nexus - Neram Classroom',
  description: 'Classroom management platform for Neram Classes',
  robots: { index: false, follow: false },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Nexus',
  },
  icons: {
    icon: [
      { url: '/icons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#7C3AED',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="emotion-insertion-point" content="" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="manifest" href="/manifest.json" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/icon?family=Material+Icons"
        />
      </head>
      <body className={inter.className}>
        <NeramThemeProvider
          lightTheme={nexusLightTheme}
          darkTheme={nexusDarkTheme}
          defaultMode="light"
        >
          <Providers>{children}</Providers>
        </NeramThemeProvider>
      </body>
    </html>
  );
}
