import type { Metadata } from 'next';
import { buildAlternates } from '@/lib/seo/metadata';

// The compare page is a client component, so its metadata lives here. Without a
// canonical of its own it inherited the home page's from the [locale] layout.
export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Compare B.Arch Colleges Side by Side',
    description:
      'Compare architecture colleges on fees, cutoffs, NIRF rank, accreditation and counselling, side by side.',
    alternates: buildAlternates(locale, '/colleges/compare'),
  };
}

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
