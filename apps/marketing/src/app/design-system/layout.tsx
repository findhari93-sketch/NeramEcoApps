// Layout for /design-system: the rendered reference for the marketing design
// system (tokens, type scale, every shared component on both surfaces).
//
// Outside the [locale] group so it is one page, not five, and excluded from the
// middleware, sitemap and robots. The page returns 404 on production.

import { Inter } from 'next/font/google';
import { ThemeRegistry, marketingLightTheme, marketingDarkTheme } from '@neram/ui';
import '@/styles/globals.css';
import EnglishIntl from './EnglishIntl';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata = {
  title: 'Design system | Neram Classes',
  robots: { index: false, follow: false, nocache: true },
};

export default function DesignSystemLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <ThemeRegistry
          options={{ key: 'neram-ds-mui' }}
          lightTheme={marketingLightTheme}
          darkTheme={marketingDarkTheme}
          defaultMode="light"
        >
          {/* Components use the locale-aware Link; the styleguide is English only. */}
          <EnglishIntl>{children}</EnglishIntl>
        </ThemeRegistry>
      </body>
    </html>
  );
}
