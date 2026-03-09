import type { Metadata } from 'next';
import { Container, Typography, Box, Paper } from '@mui/material';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy Policy for aiArchitek by Neram Classes',
};

export default function PrivacyPolicyPage() {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper sx={{ p: { xs: 3, md: 5 } }}>
        <Typography variant="h4" component="h1" gutterBottom fontWeight={700}>
          Privacy Policy
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Last updated: March 9, 2026
        </Typography>

        <Box sx={{ mt: 3, '& h2': { mt: 4, mb: 1 }, '& p': { mb: 2 } }}>
          <Typography variant="h6" component="h2" fontWeight={600}>
            1. Introduction
          </Typography>
          <Typography>
            Neram Classes (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) operates the aiArchitek - NATA/JEE Paper 2
            Learning App (the &quot;Service&quot;) at neramclasses.com. This Privacy Policy explains how we
            collect, use, and protect your personal information when you use our Service.
          </Typography>

          <Typography variant="h6" component="h2" fontWeight={600}>
            2. Information We Collect
          </Typography>
          <Typography>
            We collect the following information when you use our Service:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li>
              <Typography><strong>Account Information:</strong> Name, email address, phone number, and profile photo provided during sign-up via Google Sign-In or phone OTP verification.</Typography>
            </li>
            <li>
              <Typography><strong>Student Profile Data:</strong> Educational details such as NATA scores, preferred colleges, and exam center preferences that you provide to use our tools.</Typography>
            </li>
            <li>
              <Typography><strong>Payment Information:</strong> Transaction details processed through Razorpay. We do not store your card or bank details directly.</Typography>
            </li>
            <li>
              <Typography><strong>Usage Data:</strong> Information about how you interact with the Service, including pages visited and features used.</Typography>
            </li>
          </Box>

          <Typography variant="h6" component="h2" fontWeight={600}>
            3. How We Use Your Information
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li><Typography>To provide and maintain our Service (cutoff calculator, college predictor, exam center locator)</Typography></li>
            <li><Typography>To authenticate your identity and secure your account</Typography></li>
            <li><Typography>To process payments for premium features</Typography></li>
            <li><Typography>To send important updates about the Service</Typography></li>
            <li><Typography>To improve our tools and user experience</Typography></li>
          </Box>

          <Typography variant="h6" component="h2" fontWeight={600}>
            4. Third-Party Services
          </Typography>
          <Typography>
            We use the following third-party services to operate our platform:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li><Typography><strong>Google Firebase:</strong> For authentication (Google Sign-In and phone OTP verification)</Typography></li>
            <li><Typography><strong>Supabase:</strong> For secure data storage and database management</Typography></li>
            <li><Typography><strong>Razorpay:</strong> For payment processing (governed by Razorpay&apos;s privacy policy)</Typography></li>
            <li><Typography><strong>Vercel:</strong> For hosting and content delivery</Typography></li>
          </Box>

          <Typography variant="h6" component="h2" fontWeight={600}>
            5. Data Security
          </Typography>
          <Typography>
            We implement industry-standard security measures to protect your data, including encrypted
            connections (HTTPS), secure authentication tokens, and role-based access controls. However,
            no method of electronic storage is 100% secure.
          </Typography>

          <Typography variant="h6" component="h2" fontWeight={600}>
            6. Data Retention
          </Typography>
          <Typography>
            We retain your personal data for as long as your account is active or as needed to provide
            the Service. You may request deletion of your account and associated data at any time by
            contacting us.
          </Typography>

          <Typography variant="h6" component="h2" fontWeight={600}>
            7. Your Rights
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li><Typography>Access your personal data stored with us</Typography></li>
            <li><Typography>Request correction of inaccurate data</Typography></li>
            <li><Typography>Request deletion of your account and data</Typography></li>
            <li><Typography>Withdraw consent for data processing</Typography></li>
          </Box>

          <Typography variant="h6" component="h2" fontWeight={600}>
            8. Children&apos;s Privacy
          </Typography>
          <Typography>
            Our Service is intended for students aged 13 and above. We do not knowingly collect
            personal information from children under 13. If you believe we have collected data from a
            child under 13, please contact us immediately.
          </Typography>

          <Typography variant="h6" component="h2" fontWeight={600}>
            9. Changes to This Policy
          </Typography>
          <Typography>
            We may update this Privacy Policy from time to time. We will notify you of any changes by
            updating the &quot;Last updated&quot; date at the top of this page.
          </Typography>

          <Typography variant="h6" component="h2" fontWeight={600}>
            10. Contact Us
          </Typography>
          <Typography>
            If you have any questions about this Privacy Policy or wish to exercise your rights,
            please contact us at:
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 2 }}>
            <li><Typography><strong>Email:</strong> support@neramclasses.com</Typography></li>
            <li><Typography><strong>Website:</strong> neramclasses.com</Typography></li>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
}
