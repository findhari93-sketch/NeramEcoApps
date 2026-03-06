import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'NATA Exam Centers 2025 - 96 Cities, Confidence Ratings & TCS iON Verified | Neram',
  description:
    'Find probable NATA 2025 exam centers across 96 cities in 26 states. Confidence ratings, TCS iON verified addresses, alternate venues, B.Arch college proximity, and directions. Updated with the latest CoA brochure data.',
  keywords:
    'NATA exam centers 2025, NATA test centers near me, NATA exam center list, TCS iON exam centers, NATA center locator, NATA 2025 exam cities, CoA brochure centers',
  openGraph: {
    title: 'NATA Exam Centers 2025 - 96 Cities with Confidence Ratings | Neram',
    description:
      'Find probable NATA 2025 exam centers across 96 cities. Confidence ratings, TCS iON verified addresses, alternate venues, and directions.',
    type: 'website',
    url: 'https://app.neramclasses.com/tools/nata/exam-centers',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NATA Exam Centers 2025 - 96 Cities with Confidence Ratings | Neram',
    description:
      'Find probable NATA 2025 exam centers across 96 cities in 26 states with TCS iON verification and confidence ratings.',
  },
  alternates: {
    canonical: 'https://app.neramclasses.com/tools/nata/exam-centers',
  },
};

export default function ExamCentersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
