import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import AchievementsPageContent from '@/components/AchievementsPageContent';

const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  return {
    title: 'Student Achievements - NATA & JEE Paper 2 Toppers',
    description: 'Congratulations to our students who secured top ranks in NATA and JEE Paper 2 exams. View achievements by academic year.',
    keywords: 'NATA toppers, JEE Paper 2 results, architecture entrance toppers, Neram Classes achievements, student success',
    alternates: {
      canonical: locale === 'en' ? `${baseUrl}/achievements` : `${baseUrl}/${locale}/achievements`,
    },
  };
}

export default function AchievementsPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  return <AchievementsPageContent locale={locale} />;
}
