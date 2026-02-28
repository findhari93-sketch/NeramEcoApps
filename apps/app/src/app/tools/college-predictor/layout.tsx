import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'NATA College Predictor 2026 - Find Best Architecture Colleges | Neram',
  description:
    'Predict which architecture colleges you can get into with your NATA score. Search 5000+ colleges across India. Filter by state, category, and college type. Free tool.',
  keywords:
    'NATA college predictor, architecture college predictor, NATA score college list, best architecture colleges India',
  openGraph: {
    title: 'NATA College Predictor 2026 - Find Best Architecture Colleges | Neram',
    description:
      'Predict which architecture colleges you can get into with your NATA score. Search 5000+ colleges across India. Filter by state, category, and college type. Free tool.',
    type: 'website',
    url: 'https://app.neramclasses.com/tools/college-predictor',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NATA College Predictor 2026 - Find Best Architecture Colleges | Neram',
    description:
      'Predict which architecture colleges you can get into with your NATA score. Search 5000+ colleges across India.',
  },
  alternates: {
    canonical: 'https://app.neramclasses.com/tools/college-predictor',
  },
};

export default function CollegePredictorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
