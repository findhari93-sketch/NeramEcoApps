'use client';

import { FormProvider } from '@/components/apply/FormContext';
import ApplyFlow from '@/components/apply/ApplyFlow';

/** The apply page body. The shell around it comes from SiteChrome. */
export default function ApplyPageContent() {
  return (
    <FormProvider>
      <ApplyFlow />
    </FormProvider>
  );
}
