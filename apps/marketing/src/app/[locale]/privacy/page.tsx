import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { buildAlternates } from '@/lib/seo/metadata';
import { LegalPage } from '@/design-system';
import { legalPolicies } from '@/components/legal/policies';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Privacy Policy',
    description: 'Privacy Policy for Neram Classes. Learn how we collect, use, and protect your personal information.',
    alternates: buildAlternates(locale, '/privacy'),
  };
}

interface PageProps {
  params: { locale: string };
}

const SECTIONS = [
  {
    id: 'information-we-collect',
    title: '1. Information We Collect',
    body: (
      <>
        <p>
          At Neram Classes, we collect information you provide directly to us, such as when you create an account, enroll in a course, fill out a
          form, or communicate with us. This information may include:
        </p>
        <ul>
          <li>Name, email address, and phone number</li>
          <li>Educational background and academic records</li>
          <li>Payment information (processed securely through Razorpay)</li>
          <li>Communications and correspondence with our team</li>
        </ul>
      </>
    ),
  },
  {
    id: 'how-we-use',
    title: '2. How We Use Your Information',
    body: (
      <>
        <p>We use the information we collect to:</p>
        <ul>
          <li>Provide, maintain, and improve our educational services</li>
          <li>Process transactions and send related information</li>
          <li>Send you technical notices, updates, and administrative messages</li>
          <li>Respond to your comments, questions, and requests</li>
          <li>Communicate with you about courses, offers, and events</li>
        </ul>
      </>
    ),
  },
  {
    id: 'information-sharing',
    title: '3. Information Sharing',
    body: (
      <p>
        We do not sell, trade, or otherwise transfer your personal information to outside parties. We may share information with trusted third
        parties who assist us in operating our website and conducting our business, so long as those parties agree to keep this information
        confidential.
      </p>
    ),
  },
  {
    id: 'data-security',
    title: '4. Data Security',
    body: (
      <p>
        We implement appropriate security measures to protect your personal information against unauthorized access, alteration, disclosure, or
        destruction. All payment transactions are processed through secure, encrypted connections via Razorpay.
      </p>
    ),
  },
  {
    id: 'cookies',
    title: '5. Cookies and Tracking',
    body: (
      <p>
        We use cookies and similar tracking technologies to track activity on our website and hold certain information. You can instruct your
        browser to refuse all cookies or to indicate when a cookie is being sent.
      </p>
    ),
  },
  {
    id: 'your-rights',
    title: '6. Your Rights',
    body: (
      <>
        <p>You have the right to:</p>
        <ul>
          <li>Access your personal data</li>
          <li>Correct inaccurate personal data</li>
          <li>Request deletion of your personal data</li>
          <li>Object to processing of your personal data</li>
          <li>Request portability of your personal data</li>
        </ul>
      </>
    ),
  },
  {
    id: 'contact',
    title: '7. Contact Us',
    body: (
      <>
        <p>If you have any questions about this Privacy Policy, please contact us at:</p>
        <p>
          Email: <a href="mailto:privacy@neramclasses.com">privacy@neramclasses.com</a>
          <br />
          Phone: <a href="tel:+919176137043">+91-9176137043</a>
          <br />
          Address: Neram Classes, Chennai, Tamil Nadu, India
        </p>
      </>
    ),
  },
];

export default async function PrivacyPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  return (
    <LegalPage
      title="Privacy Policy"
      updated="Last updated: February 2026"
      policies={await legalPolicies(locale, 'privacy')}
      railLabel="Privacy Policy"
      sections={SECTIONS}
    />
  );
}
