import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import DemoClassPageContent from '@/components/DemoClassPageContent';
import { DEMO_FAQ } from '@/components/demo-class/demo-content';

const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  return {
    title: 'Free NATA and JEE Paper 2 Demo Class, Live Online',
    description:
      'Book a free live NATA and JEE Paper 2 demo class. Pick a day and time, join on Microsoft Teams with your parents, tour the Nexus app and get an architect’s feedback on your drawings.',
    keywords: 'free NATA demo class, NATA trial class, JEE Paper 2 demo class, free architecture coaching demo, online NATA coaching',
    alternates: {
      canonical: locale === 'en' ? `${baseUrl}/demo-class` : `${baseUrl}/${locale}/demo-class`,
    },
  };
}

export default function DemoClassPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([
        { name: 'Home', url: baseUrl },
        { name: 'Demo Class', url: `${baseUrl}/demo-class` },
      ])} />
      <JsonLd data={generateFAQSchema(DEMO_FAQ.map((f) => ({ question: f.q, answer: f.a })))} />
      <DemoClassPageContent />
    </>
  );
}
