import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free NATA Cutoff Calculator 2026 - Calculate Your Score | Neram',
  description:
    'Calculate your expected NATA cutoff score for 2026. Enter Mathematics, Aptitude, and Drawing marks to get instant predictions. Category-wise analysis for General, OBC, SC, ST, EWS.',
  keywords:
    'NATA cutoff calculator, NATA score calculator, NATA 2026 cutoff, NATA marks calculator free',
  openGraph: {
    title: 'Free NATA Cutoff Calculator 2026 - Calculate Your Score | Neram',
    description:
      'Calculate your expected NATA cutoff score for 2026. Enter Mathematics, Aptitude, and Drawing marks to get instant predictions. Category-wise analysis for General, OBC, SC, ST, EWS.',
    type: 'website',
    url: 'https://app.neramclasses.com/tools/cutoff-calculator',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free NATA Cutoff Calculator 2026 - Calculate Your Score | Neram',
    description:
      'Calculate your expected NATA cutoff score for 2026. Enter Mathematics, Aptitude, and Drawing marks to get instant predictions.',
  },
  alternates: {
    canonical: 'https://app.neramclasses.com/tools/cutoff-calculator',
  },
};

export default function CutoffCalculatorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
