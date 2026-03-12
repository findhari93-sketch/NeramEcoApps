import { Suspense } from 'react';
import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import TicketTrackContent from '@/components/TicketTrackContent';
import { buildAlternates } from '@/lib/seo/metadata';

const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Track Support Ticket - Neram Classes',
    description:
      'Track the status of your support ticket at Neram Classes. Enter your ticket number to view updates.',
    alternates: buildAlternates(locale, '/support/track'),
    robots: { index: false, follow: false },
  };
}

export default function TicketTrackPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  return (
    <>
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: baseUrl },
          { name: 'Track Ticket', url: `${baseUrl}/support/track` },
        ])}
      />
      <Suspense>
        <TicketTrackContent />
      </Suspense>
    </>
  );
}
