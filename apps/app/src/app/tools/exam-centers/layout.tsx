import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'NATA Exam Centers 2025 | Find Centers Near You',
  description:
    'Find NATA exam centers near you with complete address, directions, and distance. Search by state, city, or use your location to find the nearest center.',
  keywords: [
    'NATA exam centers',
    'NATA 2025 exam centers',
    'NATA exam center list',
    'NATA center locator',
    'architecture exam centers',
    'NATA test centers near me',
  ],
  openGraph: {
    title: 'NATA Exam Centers 2025 | Neram Classes',
    description:
      'Find NATA exam centers near you with address, directions, and distance information.',
    type: 'website',
    url: 'https://app.neramclasses.com/tools/exam-centers',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NATA Exam Centers 2025',
    description: 'Find NATA exam centers near you with complete details.',
  },
  alternates: {
    canonical: 'https://app.neramclasses.com/tools/exam-centers',
  },
};

export default function ExamCentersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
