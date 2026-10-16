// The NATA 2026 guide rail is part of each spoke page now (GuideArticle `nav`,
// built by nataGuideNav in components/nata/guideNav.tsx), so this layout adds nothing.
export default function NataLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
