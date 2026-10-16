// Layout for /sso: a pass-through screen that exchanges the Marketing sign-in
// for the App and redirects. Own html/body because the root app/layout.tsx is
// a pass-through. Kept bare (no theme, no globals.css) so the redirect is fast.

export const metadata = {
  title: 'Signing you in | Neram Classes',
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  )
}
