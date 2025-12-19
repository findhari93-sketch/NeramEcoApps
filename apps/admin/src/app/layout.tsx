import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { NeramThemeProvider } from '@neram/ui';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Neram Classes - Admin Panel',
  description: 'Administrative dashboard for Neram Classes',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <NeramThemeProvider>
          {children}
        </NeramThemeProvider>
      </body>
    </html>
  );
}
