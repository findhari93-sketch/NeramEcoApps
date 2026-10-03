import type { Metadata } from 'next';
import { absoluteUrl } from './tool-schemas';

/**
 * Metadata for a public tool or place page: its own canonical (never the
 * homepage), Open Graph, and robots from the index gate. `title` is used as
 * written (the root template would push it past 60 characters).
 */
export function toolPageMetadata(opts: {
  title: string;
  description: string;
  path: string;
  index?: boolean;
  keywords?: string[];
}): Metadata {
  const url = absoluteUrl(opts.path);
  const index = opts.index ?? true;
  return {
    title: { absolute: opts.title },
    description: opts.description,
    ...(opts.keywords?.length ? { keywords: opts.keywords } : {}),
    alternates: { canonical: url },
    robots: index ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      title: opts.title,
      description: opts.description,
      url,
      type: 'website',
      siteName: 'aiArchitek by Neram Classes',
      locale: 'en_IN',
    },
    twitter: { card: 'summary_large_image', title: opts.title, description: opts.description },
  };
}
