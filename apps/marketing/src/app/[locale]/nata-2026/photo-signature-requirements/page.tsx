import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import CropOutlinedIcon from '@mui/icons-material/CropOutlined';
import { nataGuideNav, nataRelated } from '@/components/nata/guideNav';
import { ArticleSection, CtaBand, CtaButton, FactGrid, FaqList, GuideArticle, InlineCta } from '@/design-system';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { APP_URL } from '@/lib/seo/constants';


export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA 2026 Photo & Signature Upload Requirements',
    description:
      'Exact NATA 2026 photo and signature specifications. Photo: 3.5x4.5 cm, 4-100 KB, JPG. Signature: 3.5x1.5 cm, 1-30 KB, JPG. Free crop tool included.',
    keywords:
      'NATA 2026 photo size, NATA signature size, NATA photo upload, NATA photo requirements, NATA 2026 image specifications',
    alternates: buildAlternates(locale, '/nata-2026/photo-signature-requirements'),
  };
}

interface PageProps {
  params: { locale: string };
}

const photoSpecs = [
  { label: 'Dimensions', value: '3.5 cm x 4.5 cm' },
  { label: 'File Size', value: '4 KB to 100 KB' },
  { label: 'Format', value: 'JPG / JPEG only' },
  { label: 'Background', value: 'White or light-colored' },
  { label: 'Face Coverage', value: '80% of the frame' },
  { label: 'Pose', value: 'Front-facing, both ears visible' },
  { label: 'Recency', value: 'Taken within last 6 months' },
];

const signatureSpecs = [
  { label: 'Dimensions', value: '3.5 cm x 1.5 cm' },
  { label: 'File Size', value: '1 KB to 30 KB' },
  { label: 'Format', value: 'JPG / JPEG only' },
  { label: 'Ink Color', value: 'Black or dark blue ink' },
  { label: 'Background', value: 'White paper' },
  { label: 'Style', value: 'Running hand (not block letters)' },
];

const faqs = [
  {
    question: 'What happens if my NATA photo does not meet the specifications?',
    answer:
      'If your photo does not meet the specifications, your application may be rejected during verification. Use a proper passport-size photo with white background, and ensure the file size is between 4-100 KB in JPG format.',
  },
  {
    question: 'Can I upload a selfie for NATA application?',
    answer:
      'No, selfies are not recommended. The photo should be a passport-size photograph taken at a studio or with proper lighting. The face should cover 80% of the frame with a white background.',
  },
  {
    question: 'How do I reduce my photo file size to under 100 KB?',
    answer:
      'Use our free Image Crop tool at app.neramclasses.com/tools/nata/image-crop which automatically resizes and compresses your photo to meet NATA specifications. You can also use image editing software to resize and compress.',
  },
  {
    question: 'Should the signature be on white paper?',
    answer:
      'Yes, sign with black or dark blue ink on a plain white paper. Scan or photograph the signature and crop it to 3.5x1.5 cm. Ensure the file size is between 1-30 KB in JPG format.',
  },
];

export default function PhotoSignaturePage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const baseUrl = 'https://neramclasses.com';
  const localeUrl = (path: string) => locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([{ name: 'Home', url: localeUrl('') }, { name: 'NATA 2026', url: localeUrl('/nata-2026') }, { name: 'Photo & Signature Requirements' }])} />
      <JsonLd data={generateFAQSchema(faqs)} />

      <GuideArticle
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'NATA 2026', href: '/nata-2026' }, { name: 'Photo & Signature Requirements' }]}
        eyebrow="NATA 2026 · Exam guide"
        title="NATA 2026 Photo & Signature Requirements"
        lede="Your NATA 2026 application requires a passport-size photo (3.5x4.5 cm, 4-100 KB, JPG) and a signature scan (3.5x1.5 cm, 1-30 KB, JPG). Both must be on white background."
        verified="Updated March 13, 2026 · Source: Official NATA 2026 Brochure V1.0"
        nav={nataGuideNav('photo-signature-requirements')}
        related={nataRelated(['how-to-apply', 'eligibility', 'fee-structure', 'dos-and-donts'])}
        back={{ label: 'Back to NATA 2026 guide', href: '/nata-2026' }}
      >
        <ArticleSection id="photo-specifications" title="Photograph Specifications">
          <FactGrid items={photoSpecs} />
        </ArticleSection>

        <ArticleSection id="signature-specifications" title="Signature Specifications">
          <FactGrid items={signatureSpecs} />
        </ArticleSection>

        <InlineCta
          eyebrow="Free tool"
          icon={<CropOutlinedIcon />}
          title="Crop & Resize Your Photo and Signature"
          body="Use our free Image Crop tool to resize your photo and signature to exact NATA specifications. No software needed."
          action={
            <CtaButton href={`${APP_URL}/tools/nata/image-crop`} external>
              Open Image Crop Tool (Free)
            </CtaButton>
          }
        />

        <ArticleSection id="faq" title="FAQs: Photo & Signature">
          <FaqList items={faqs} defaultOpen={-1} />
        </ArticleSection>
      </GuideArticle>

      <CtaBand
        title="Prepare for NATA 2026 with Neram Classes"
        lede="Expert coaching, free tools, and personalized guidance."
        actions={
          <>
            <CtaButton href="/apply">Start Free Trial</CtaButton>
            <CtaButton variant="link" href="/nata-2026">
              Back to NATA 2026 Guide
            </CtaButton>
          </>
        }
      />
    </>
  );
}
