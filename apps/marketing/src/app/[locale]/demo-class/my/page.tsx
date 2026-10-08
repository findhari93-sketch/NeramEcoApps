import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import MyDemoContent from '@/components/demo-class/MyDemoContent';

export const metadata: Metadata = {
  title: 'My demo class',
  robots: { index: false, follow: false },
};

/** /demo-class/my: the signed-in student's demo, with change and cancel. Per user, so all client-side. */
export default function MyDemoPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  return <MyDemoContent />;
}
