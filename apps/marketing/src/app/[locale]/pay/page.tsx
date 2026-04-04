import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import PaymentPage from '@/components/pay/PaymentPage';

const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Complete Your Payment - Neram Classes',
    description:
      'Complete your course fee payment securely via Razorpay. Pay in full or choose installments for your NATA / JEE Paper 2 coaching at Neram Classes.',
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default function PayPage({
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
          { name: 'Pay', url: `${baseUrl}/pay` },
        ])}
      />
      <PaymentPage />
    </>
  );
}
