'use client';

import { FormProvider } from '@/components/apply/FormContext';
import ApplyLayout from '@/components/apply/ApplyLayout';
import ApplyFlow from '@/components/apply/ApplyFlow';

/** The apply page body. The shell around it comes from SiteChrome. */
export default function ApplyPageContent() {
  return (
    <FormProvider>
      <ApplyLayout>
        <ApplyFlow />
      </ApplyLayout>
    </FormProvider>
  );
}
