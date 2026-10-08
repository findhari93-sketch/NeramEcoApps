// Layout for /d/* — the demo-class link behind the WhatsApp "Join" button.
//
// Outside the [locale] group for the same reason as /s/*: the URL is short,
// locale-free and opened on phones, often on a slow connection. Own html/body
// because the root app/layout.tsx is a pass-through.

import { ThemeRegistry, marketingLightTheme, marketingDarkTheme } from '@neram/ui';
import '@/styles/globals.css';

export const metadata = {
  title: 'Your demo class | Neram Classes',
  robots: { index: false, follow: false, nocache: true },
};

export default function DemoLinkLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeRegistry
          options={{ key: 'neram-demo-mui' }}
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
