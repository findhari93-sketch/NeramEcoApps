import type { Metadata } from 'next';
import ToolsHub from '@/components/tools-hub/ToolsHub';

// The signed-in Tools tab. The public, indexable tools landing page stays at
// /tools (src/app/tools/page.tsx); this one sits behind sign-in, so keep it
// out of search results.
export const metadata: Metadata = {
  title: 'All tools',
  description: 'Every aiArchitek tool for NATA, JEE Paper 2 and B.Arch counseling in one place.',
  robots: { index: false, follow: true },
};

export default function AllToolsPage() {
  return <ToolsHub />;
}
