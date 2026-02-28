import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'NATA Exam Center Locator 2026 - Find Centers Near You | Neram',
  description:
    'Find NATA exam centers near your location. Search by state, city, or pincode. Get directions, address, and capacity details for all exam centers across India.',
  keywords:
    'NATA exam centers, NATA test centers near me, NATA exam center list 2026, NATA center locator',
  openGraph: {
    title: 'NATA Exam Center Locator 2026 - Find Centers Near You | Neram',
    description:
      'Find NATA exam centers near your location. Search by state, city, or pincode. Get directions, address, and capacity details for all exam centers across India.',
    type: 'website',
    url: 'https://app.neramclasses.com/tools/exam-centers',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NATA Exam Center Locator 2026 - Find Centers Near You | Neram',
    description:
      'Find NATA exam centers near your location. Search by state, city, or pincode. Get directions and capacity details.',
  },
  alternates: {
    canonical: 'https://app.neramclasses.com/tools/exam-centers',
  },
};

export default function ExamCentersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
