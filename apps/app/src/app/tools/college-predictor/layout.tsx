import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'NATA College Predictor 2025 | Find Best Architecture Colleges',
  description:
    'Find architecture colleges matching your NATA score. Get personalized predictions based on historical cutoffs, fees, and admission trends for 5000+ colleges.',
  keywords: [
    'NATA college predictor',
    'architecture college predictor',
    'NATA score based college',
    'best architecture colleges in India',
    'NATA 2025 colleges',
    'B.Arch college predictor',
  ],
  openGraph: {
    title: 'NATA College Predictor 2025 | Neram Classes',
    description:
      'Find architecture colleges matching your NATA score with AI-powered predictions for 5000+ colleges across India.',
    type: 'website',
    url: 'https://app.neramclasses.com/tools/college-predictor',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NATA College Predictor 2025',
    description: 'Find best architecture colleges for your NATA score.',
  },
  alternates: {
    canonical: 'https://app.neramclasses.com/tools/college-predictor',
  },
};

export default function CollegePredictorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
