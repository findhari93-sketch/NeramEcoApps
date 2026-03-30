import { redirect } from 'next/navigation';

// Redirect locale-prefixed /en/thank-you, /ta/thank-you etc. to /thank-you
export default function LocaleThankYouRedirect({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) {
  const app = searchParams.app;
  redirect(app ? `/thank-you?app=${encodeURIComponent(app)}` : '/thank-you');
}
