import { Suspense } from 'react';
import EnrollWizard from '@/components/enroll/EnrollWizard';
import { PageLoader } from '@neram/ui';

export default function EnrollPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <EnrollWizard />
    </Suspense>
  );
}
