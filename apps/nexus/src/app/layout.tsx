import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { NeramThemeProvider, nexusLightTheme, nexusDarkTheme } from '@neram/ui';
import Providers from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Nexus - Neram Classroom',
  description: 'Classroom management platform for Neram Classes',
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
