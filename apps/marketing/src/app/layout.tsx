// Root layout required by Next.js App Router.
// The actual html/body tags are in [locale]/layout.tsx (next-intl pattern).
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
