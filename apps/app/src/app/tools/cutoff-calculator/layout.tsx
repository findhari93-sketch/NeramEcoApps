import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'NATA Cutoff Calculator 2025 | Free Score Calculator',
  description:
    'Calculate your NATA cutoff score instantly. Enter your Mathematics, Aptitude, and Drawing scores to get personalized insights and college admission chances.',
  keywords: [
    'NATA cutoff calculator',
    'NATA 2025 cutoff',
    'NATA score calculator',
    'NATA cutoff marks',
    'architecture entrance cutoff',
    'NATA expected cutoff',
  ],
  openGraph: {
    title: 'NATA Cutoff Calculator 2025 | Neram Classes',
    description:
      'Free NATA cutoff calculator - Enter your scores and get instant results with college admission predictions.',
    type: 'website',
    url: 'https://app.neramclasses.com/tools/cutoff-calculator',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NATA Cutoff Calculator 2025',
    description: 'Calculate your NATA cutoff and get personalized college predictions.',
  },
  alternates: {
    canonical: 'https://app.neramclasses.com/tools/cutoff-calculator',
  },
};

export default function CutoffCalculatorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
