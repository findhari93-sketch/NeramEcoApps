import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Container, Typography, Paper } from '@neram/ui';

export const metadata: Metadata = {
  title: 'Terms & Conditions - Neram Classes',
  description: 'Terms and Conditions for using Neram Classes services. Read our policies on enrollment, payments, and more.',
  alternates: {
    canonical: 'https://neramclasses.com/en/terms',
  },
};

interface PageProps {
  params: { locale: string };
}

export default function TermsPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  return (
    <Box sx={{ py: { xs: 4, md: 8 }, bgcolor: 'background.default', minHeight: '80vh' }}>
      <Container maxWidth="md">
        <Paper sx={{ p: { xs: 3, md: 6 } }}>
          <Typography variant="h2" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
            Terms & Conditions
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            Last updated: January 2025
          </Typography>

          <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4, fontWeight: 600 }}>
            1. Acceptance of Terms
          </Typography>
          <Typography variant="body1" paragraph>
            By accessing and using the Neram Classes website and services, you accept and agree to be
            bound by the terms and provisions of this agreement. If you do not agree to these terms,
            please do not use our services.
          </Typography>

          <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4, fontWeight: 600 }}>
            2. Services Description
          </Typography>
          <Typography variant="body1" paragraph>
            Neram Classes provides online and offline coaching services for competitive examinations
            including NATA, JEE Paper 2, NEET, and other academic courses. We offer:
          </Typography>
          <Box component="ul" sx={{ pl: 3 }}>
            <Typography component="li" variant="body1">Live and recorded video lectures</Typography>
            <Typography component="li" variant="body1">Study materials and resources</Typography>
            <Typography component="li" variant="body1">Practice tests and mock examinations</Typography>
            <Typography component="li" variant="body1">Personal mentoring and doubt clearing sessions</Typography>
            <Typography component="li" variant="body1">College predictor and other educational tools</Typography>
          </Box>

          <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4, fontWeight: 600 }}>
            3. Enrollment and Fees
          </Typography>
          <Typography variant="body1" paragraph>
            Enrollment in our courses is subject to availability and payment of applicable fees.
            Course fees are non-refundable except as specified in our refund policy. We reserve the
            right to modify course fees at any time without prior notice.
          </Typography>

          <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4, fontWeight: 600 }}>
            4. User Responsibilities
          </Typography>
          <Typography variant="body1" paragraph>
            As a user of our services, you agree to:
          </Typography>
          <Box component="ul" sx={{ pl: 3 }}>
            <Typography component="li" variant="body1">Provide accurate and complete registration information</Typography>
            <Typography component="li" variant="body1">Maintain the confidentiality of your account credentials</Typography>
            <Typography component="li" variant="body1">Not share your login credentials with others</Typography>
            <Typography component="li" variant="body1">Not reproduce, distribute, or share course materials without permission</Typography>
            <Typography component="li" variant="body1">Comply with all applicable laws and regulations</Typography>
          </Box>

          <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4, fontWeight: 600 }}>
            5. Intellectual Property
          </Typography>
          <Typography variant="body1" paragraph>
            All content provided through our services, including but not limited to text, graphics,
            logos, videos, and study materials, are the property of Neram Classes and are protected
            by copyright and other intellectual property laws.
          </Typography>

          <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4, fontWeight: 600 }}>
            6. Payment Terms
          </Typography>
          <Typography variant="body1" paragraph>
            Payments can be made through various methods including online payment gateway (Razorpay),
            bank transfer, or UPI. All payments are processed securely. Installment payment options
            are available for select courses.
          </Typography>

          <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4, fontWeight: 600 }}>
            7. Refund Policy
          </Typography>
          <Typography variant="body1" paragraph>
            Refund requests must be made within 7 days of enrollment. After 7 days, or if the student
            has accessed more than 20% of the course content, no refund will be provided. Processing
            fees may apply to approved refunds.
          </Typography>

          <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4, fontWeight: 600 }}>
            8. Limitation of Liability
          </Typography>
          <Typography variant="body1" paragraph>
            Neram Classes shall not be liable for any indirect, incidental, special, consequential,
            or punitive damages resulting from your use of our services. Our total liability shall
            not exceed the amount paid by you for the specific service in question.
          </Typography>

          <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4, fontWeight: 600 }}>
            9. Modifications to Terms
          </Typography>
          <Typography variant="body1" paragraph>
            We reserve the right to modify these terms at any time. Changes will be effective
            immediately upon posting on this page. Your continued use of our services after any
            changes constitutes acceptance of the new terms.
          </Typography>

          <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4, fontWeight: 600 }}>
            10. Governing Law
          </Typography>
          <Typography variant="body1" paragraph>
            These terms shall be governed by and construed in accordance with the laws of India.
            Any disputes arising under these terms shall be subject to the exclusive jurisdiction
            of the courts in Chennai, Tamil Nadu.
          </Typography>

          <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4, fontWeight: 600 }}>
            11. Contact Information
          </Typography>
          <Typography variant="body1" paragraph>
            For any questions about these Terms & Conditions, please contact us at:
          </Typography>
          <Typography variant="body1">
            Email: legal@neramclasses.com<br />
            Phone: +91-XXXX-XXXXXX<br />
            Address: Neram Classes, Chennai, Tamil Nadu, India
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
}
