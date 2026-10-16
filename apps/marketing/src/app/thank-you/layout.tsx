// Layout for /thank-you: the confirmation after the application form.
//
// Outside the [locale] group (the locale routes redirect here), so it has its
// own html/body: the root app/layout.tsx is a pass-through. The ThemeRegistry
// and globals.css give it the site theme, font stack and focus rings.

import { ThemeRegistry, marketingLightTheme, marketingDarkTheme } from '@neram/ui';
import GoogleAdsTag from '@/components/GoogleAdsTag';
import '@/styles/globals.css';

export const metadata = {
  title: 'Thank You | Neram Classes',
  description: 'Your application has been submitted successfully.',
};

export default function ThankYouLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <GoogleAdsTag />
        <ThemeRegistry
          options={{ key: 'neram-thanks-mui' }}
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
