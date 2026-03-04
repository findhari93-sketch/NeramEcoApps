'use client';

import { useParams } from 'next/navigation';
import { usePathname } from '@/i18n/routing';
import SpokeNavSidebar from './SpokeNavSidebar';
import { spokePages } from './data/spokePages';

const spokeSlugs = new Set(spokePages.map((p) => p.slug));

export default function NataSpokeNavWrapper() {
  const pathname = usePathname(); // locale-stripped, e.g. /nata-2026/eligibility
  const params = useParams();
  const locale = (params?.locale as string) || 'en';

  const match = pathname.match(/^\/nata-2026\/([^/]+)$/);
  const slug = match?.[1];

  if (!slug || !spokeSlugs.has(slug)) return null;

  return <SpokeNavSidebar locale={locale} currentSlug={slug} />;
}
