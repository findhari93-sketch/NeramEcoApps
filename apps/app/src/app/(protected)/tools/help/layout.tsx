import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Help and Support',
  description:
    'Get help with aiArchitek tools and NATA preparation. Chat with the Neram Classes team, raise a ticket, email or call us.',
  keywords: [
    'NATA help',
    'NATA support',
    'Neram Classes contact',
    'NATA preparation help',
    'architecture coaching support',
  ],
  openGraph: {
    title: 'Help and Support | aiArchitek by Neram Classes',
    description:
      'Chat with our support team for guidance on NATA preparation, college selection, and course enrollment.',
    type: 'website',
    url: 'https://app.neramclasses.com/tools/help',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Help and Support | aiArchitek',
    description: 'Get help with NATA preparation and aiArchitek tools from Neram Classes.',
  },
  alternates: {
    canonical: 'https://app.neramclasses.com/tools/help',
  },
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
