// Layout for /admin/* routes. These pages are outside the [locale] group and
// need their own html/body since the root app/layout.tsx is a pass-through.
// Keep this lightweight: just html/body/ThemeRegistry so MUI works and Next.js
// can render a valid HTML document.

import { ThemeRegistry, marketingLightTheme, marketingDarkTheme } from '@neram/ui';
import '@/styles/globals.css';

export const metadata = {
  title: 'Neram Staff',
  description: 'Internal admin tools for Neram Classes staff.',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeRegistry
          options={{ key: 'neram-admin-mui' }}
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
