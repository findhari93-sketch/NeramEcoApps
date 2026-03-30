import GoogleAdsTag from '@/components/GoogleAdsTag';

export const metadata = {
  title: 'Thank You | Neram Classes',
  description: 'Your application has been submitted successfully.',
};

export default function ThankYouLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <GoogleAdsTag />
        {children}
      </body>
    </html>
  );
}
