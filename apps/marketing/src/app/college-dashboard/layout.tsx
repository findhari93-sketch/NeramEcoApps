// Layout for /college-dashboard/* routes. These pages are outside the [locale] group
// and need their own html/body since the root app/layout.tsx is a pass-through.
// Matches the admin/layout.tsx pattern: server layout provides html/body + ThemeRegistry,
// client provider/shell lives in ClientShell.tsx.

import { ThemeRegistry, marketingLightTheme, marketingDarkTheme } from '@neram/ui';
import '@/styles/globals.css';
import ClientShell from './ClientShell';

export const metadata = {
  title: 'College Dashboard | Neram Classes',
  description: 'Manage your college profile, leads, and analytics.',
  robots: { index: false, follow: false },
};

export default function CollegeDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeRegistry
          options={{ key: 'neram-college-mui' }}
          lightTheme={marketingLightTheme}
          darkTheme={marketingDarkTheme}
          defaultMode="light"
        >
          <ClientShell>{children}</ClientShell>
        </ThemeRegistry>
      </body>
    </html>
  );
}
