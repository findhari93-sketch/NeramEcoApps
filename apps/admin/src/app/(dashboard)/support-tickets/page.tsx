import { Suspense } from 'react';
import SupportInbox from '@/components/support-inbox/SupportInbox';

// Admin > Support tickets: a split inbox with the full ticket lifecycle.
// Staff pages are dynamic and low traffic. The view is read from the URL on
// the client, so the Suspense boundary is only a fallback for the build.
export default function SupportTicketsPage() {
  return (
    <Suspense fallback={null}>
      <SupportInbox />
    </Suspense>
  );
}
