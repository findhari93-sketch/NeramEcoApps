import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Answer Pad | Neram',
};

/**
 * No sidebar and no bottom navigation: the Answer Pad lives in a Teams meeting
 * side panel about 320px wide, or on a phone opened from a room code.
 */
export default function PadLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
