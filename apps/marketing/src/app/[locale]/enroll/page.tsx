import { Suspense } from 'react';
import { Metadata } from 'next';
import EnrollWizard from '@/components/enroll/EnrollWizard';
import { PageLoader } from '@neram/ui';
import { buildAlternates } from '@/lib/seo/metadata';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Complete Your Enrollment',
    description:
      'Complete your enrollment at Neram Classes. Verify your details, choose your course, and start your NATA/JEE Paper 2 preparation journey.',
    alternates: buildAlternates(locale, '/enroll'),
    robots: { index: false, follow: true },
  };
}

export default function EnrollPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <EnrollWizard />
    </Suspense>
  );
}
