// Layout for /s/* — the "your details" link a student opens from WhatsApp.
//
// Outside the [locale] group, so it needs its own html/body: the root app/layout.tsx
// is a pass-through. Follows college-dashboard/layout.tsx, which solves the same
// problem.
//
// Deliberately carries no Header, Footer or next-intl provider. Most of the students
// this is sent to open it on a phone, often on a slow connection, and the page has
// one job. Keeping the bundle to the form is worth more here than a nav bar.
//
// English only for now. The audience is largely Tamil-speaking, so a ?lang=ta pass
// with a small inline dictionary is the obvious next step; pulling next-intl onto
// this route would undo the point of keeping it outside [locale].

import { ThemeRegistry, marketingLightTheme, marketingDarkTheme } from '@neram/ui';
import '@/styles/globals.css';

export const metadata = {
  title: 'Your details | Neram Classes',
  // Stricter than the enroll page, which allows follow. Nothing here should be
  // crawled, archived or followed: the URL is a credential.
  robots: { index: false, follow: false, nocache: true },
};

export default function DetailRequestLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeRegistry
          options={{ key: 'neram-details-mui' }}
          lightTheme={marketingLightTheme}
          darkTheme={marketingDarkTheme}
          defaultMode="light"
        >
          {children}
        </ThemeRegistry>
      </body>
    </html>
  );
}
