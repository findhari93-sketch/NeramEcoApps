import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import AchievementsPageWrapper from '@/components/achievements/AchievementsPageWrapper';

const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  return {
    title: 'Student Results & Achievements | Neram Classes',
    description: 'View student exam results, scorecards, and college placements. Our students secured top ranks in NATA, JEE Paper 2, and TNEA exams.',
    keywords: 'NATA toppers, JEE Paper 2 results, TNEA results, architecture entrance toppers, Neram Classes achievements, student scorecards, college placements',
    alternates: {
      canonical: locale === 'en' ? `${baseUrl}/achievements` : `${baseUrl}/${locale}/achievements`,
    },
  };
}

export default function AchievementsPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  return <AchievementsPageWrapper locale={locale} />;
}
