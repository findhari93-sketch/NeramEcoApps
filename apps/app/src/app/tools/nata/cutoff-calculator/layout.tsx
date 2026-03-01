import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Free NATA Cutoff Calculator 2026 - Board + NATA Score /400 | Neram',
  description:
    'Calculate your NATA cutoff score out of 400. Convert 12th board marks to /200, add best NATA score /200, check Part A/B eligibility, multi-attempt & cross-year rules. Free, instant results.',
  keywords:
    'NATA cutoff calculator 2026, NATA score calculator, NATA eligibility checker, NATA Part A Part B marks, NATA cutoff out of 400, board marks conversion NATA, NATA qualifying marks, NATA 2026 cutoff',
  openGraph: {
    title: 'Free NATA Cutoff Calculator 2026 - Board + NATA Score /400 | Neram',
    description:
      'Calculate your NATA cutoff score out of 400. Convert board marks, check NATA eligibility, multi-attempt & cross-year rules. Free, instant.',
    type: 'website',
    url: 'https://app.neramclasses.com/tools/nata/cutoff-calculator',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free NATA Cutoff Calculator 2026 | Neram',
    description:
      'Calculate your NATA cutoff score out of 400. Board marks + NATA score with eligibility check.',
  },
  alternates: {
    canonical: 'https://app.neramclasses.com/tools/nata/cutoff-calculator',
  },
};

export default function CutoffCalculatorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
