// Layout for /college-update/<token>: the no-login form a college gets on
// WhatsApp. Outside the [locale] group like /college-dashboard, so it brings its
// own html/body (the root app/layout.tsx is a pass-through).

import { ThemeRegistry, marketingLightTheme, marketingDarkTheme } from '@neram/ui';
import '@/styles/globals.css';

export const metadata = {
  title: 'Update your college details | Neram Classes',
  robots: { index: false, follow: false },
};

export default function CollegeUpdateLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeRegistry options={{ key: 'neram-college-update' }} lightTheme={marketingLightTheme} darkTheme={marketingDarkTheme} defaultMode="light">
          {children}
        </ThemeRegistry>
      </body>
    </html>
  );
}
