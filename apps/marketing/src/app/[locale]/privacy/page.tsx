import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Container, Typography, Paper } from '@neram/ui';

export const metadata: Metadata = {
  title: 'Privacy Policy - Neram Classes',
  description: 'Privacy Policy for Neram Classes. Learn how we collect, use, and protect your personal information.',
  alternates: {
    canonical: 'https://neramclasses.com/en/privacy',
  },
};

interface PageProps {
  params: { locale: string };
}

export default function PrivacyPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  return (
    <Box sx={{ py: { xs: 4, md: 8 }, bgcolor: 'background.default', minHeight: '80vh' }}>
      <Container maxWidth="md">
        <Paper sx={{ p: { xs: 3, md: 6 } }}>
          <Typography variant="h2" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
            Privacy Policy
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            Last updated: January 2025
          </Typography>

          <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4, fontWeight: 600 }}>
            1. Information We Collect
          </Typography>
          <Typography variant="body1" paragraph>
            At Neram Classes, we collect information you provide directly to us, such as when you create an account,
            enroll in a course, fill out a form, or communicate with us. This information may include:
          </Typography>
          <Box component="ul" sx={{ pl: 3 }}>
            <Typography component="li" variant="body1">Name, email address, and phone number</Typography>
            <Typography component="li" variant="body1">Educational background and academic records</Typography>
            <Typography component="li" variant="body1">Payment information (processed securely through Razorpay)</Typography>
            <Typography component="li" variant="body1">Communications and correspondence with our team</Typography>
          </Box>

          <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4, fontWeight: 600 }}>
            2. How We Use Your Information
          </Typography>
          <Typography variant="body1" paragraph>
            We use the information we collect to:
          </Typography>
          <Box component="ul" sx={{ pl: 3 }}>
            <Typography component="li" variant="body1">Provide, maintain, and improve our educational services</Typography>
            <Typography component="li" variant="body1">Process transactions and send related information</Typography>
            <Typography component="li" variant="body1">Send you technical notices, updates, and administrative messages</Typography>
            <Typography component="li" variant="body1">Respond to your comments, questions, and requests</Typography>
            <Typography component="li" variant="body1">Communicate with you about courses, offers, and events</Typography>
          </Box>

          <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4, fontWeight: 600 }}>
            3. Information Sharing
          </Typography>
          <Typography variant="body1" paragraph>
            We do not sell, trade, or otherwise transfer your personal information to outside parties.
            We may share information with trusted third parties who assist us in operating our website
            and conducting our business, so long as those parties agree to keep this information confidential.
          </Typography>

          <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4, fontWeight: 600 }}>
            4. Data Security
          </Typography>
          <Typography variant="body1" paragraph>
            We implement appropriate security measures to protect your personal information against
            unauthorized access, alteration, disclosure, or destruction. All payment transactions are
            processed through secure, encrypted connections via Razorpay.
          </Typography>

          <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4, fontWeight: 600 }}>
            5. Cookies and Tracking
          </Typography>
          <Typography variant="body1" paragraph>
            We use cookies and similar tracking technologies to track activity on our website and
            hold certain information. You can instruct your browser to refuse all cookies or to
            indicate when a cookie is being sent.
          </Typography>

          <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4, fontWeight: 600 }}>
            6. Your Rights
          </Typography>
          <Typography variant="body1" paragraph>
            You have the right to:
          </Typography>
          <Box component="ul" sx={{ pl: 3 }}>
            <Typography component="li" variant="body1">Access your personal data</Typography>
            <Typography component="li" variant="body1">Correct inaccurate personal data</Typography>
            <Typography component="li" variant="body1">Request deletion of your personal data</Typography>
            <Typography component="li" variant="body1">Object to processing of your personal data</Typography>
            <Typography component="li" variant="body1">Request portability of your personal data</Typography>
          </Box>

          <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4, fontWeight: 600 }}>
            7. Contact Us
          </Typography>
          <Typography variant="body1" paragraph>
            If you have any questions about this Privacy Policy, please contact us at:
          </Typography>
          <Typography variant="body1">
            Email: privacy@neramclasses.com<br />
            Phone: +91-XXXX-XXXXXX<br />
            Address: Neram Classes, Chennai, Tamil Nadu, India
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
}
