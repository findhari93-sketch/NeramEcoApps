// Layout for /r/*: the review link a past student opens from WhatsApp.
//
// Outside the [locale] group for the same reason as /s/* and /d/*: the URL is
// short, locale-free and opened on phones. Own html/body because the root
// app/layout.tsx is a pass-through. No Header or Footer: the page has one job.

import { ThemeRegistry, marketingLightTheme, marketingDarkTheme } from '@neram/ui';
import '@/styles/globals.css';

export const metadata = {
  title: 'Share your Neram story | Neram Classes',
  // The URL is a credential: never crawled, archived or followed.
  robots: { index: false, follow: false, nocache: true },
};

export default function ReviewLinkLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeRegistry
          options={{ key: 'neram-review-mui' }}
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
