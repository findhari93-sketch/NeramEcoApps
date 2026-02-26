import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Help & Support | NATA Tools - Neram Classes',
  description:
    'Get instant help with NATA preparation. Chat with our support team for guidance on cutoff scores, college selection, exam centers, and course enrollment.',
  keywords: [
    'NATA help',
    'NATA support',
    'Neram Classes contact',
    'NATA preparation help',
    'architecture coaching support',
  ],
  openGraph: {
    title: 'Help & Support | NATA Tools - Neram Classes',
    description:
      'Chat with our support team for guidance on NATA preparation, college selection, and course enrollment.',
    type: 'website',
    url: 'https://app.neramclasses.com/tools/help',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Help & Support | NATA Tools',
    description: 'Get instant help with NATA preparation from Neram Classes.',
  },
  alternates: {
    canonical: 'https://app.neramclasses.com/tools/help',
  },
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
