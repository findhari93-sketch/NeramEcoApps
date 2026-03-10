import type { Metadata } from 'next';
import { Container, Typography, Box, Paper, Divider } from '@neram/ui';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy Policy for aiArchitek by Neram Classes',
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Box sx={{ mb: 3 }}>
    <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
      {title}
    </Typography>
    {children}
  </Box>
);

export default function PrivacyPolicyPage() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Container maxWidth="md" sx={{ flex: 1, py: { xs: 3, md: 6 } }}>
        <Paper elevation={3} sx={{ p: { xs: 3, md: 5 }, borderRadius: 1.5 }}>
          <Box sx={{ mb: 3 }}>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 600, fontSize: { xs: '1.5rem', md: '1.75rem' } }}>
              Privacy Policy
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Last updated: March 10, 2026
            </Typography>
          </Box>

          <Divider sx={{ mb: 3 }} />

          <Section title="1. Introduction">
            <Typography variant="body2" color="text.secondary">
              Neram Classes (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) operates the aiArchitek - NATA/JEE Paper 2
              Learning App (the &quot;Service&quot;) at neramclasses.com. This Privacy Policy explains how we
              collect, use, and protect your personal information when you use our Service.
            </Typography>
          </Section>

          <Section title="2. Information We Collect">
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              We collect the following information when you use our Service:
            </Typography>
            <Box component="ul" sx={{ pl: 2.5, '& li': { mb: 1 } }}>
              <li><Typography variant="body2" color="text.secondary"><strong>Account Information:</strong> Name, email address, phone number, and profile photo provided during sign-up via Google Sign-In or phone OTP verification.</Typography></li>
              <li><Typography variant="body2" color="text.secondary"><strong>Student Profile Data:</strong> Educational details such as NATA scores, preferred colleges, and exam center preferences that you provide to use our tools.</Typography></li>
              <li><Typography variant="body2" color="text.secondary"><strong>Payment Information:</strong> Transaction details processed through Razorpay. We do not store your card or bank details directly.</Typography></li>
              <li><Typography variant="body2" color="text.secondary"><strong>Device Information:</strong> Browser type, operating system, screen resolution, device type, and unique device identifiers for app functionality and diagnostics.</Typography></li>
              <li><Typography variant="body2" color="text.secondary"><strong>Precise Location:</strong> With your permission, we collect your precise GPS location to provide location-based features such as nearby exam centers and regional college recommendations.</Typography></li>
              <li><Typography variant="body2" color="text.secondary"><strong>Diagnostics &amp; Error Logs:</strong> Crash reports, error logs, and performance data to identify and fix issues, improving the app experience for all users.</Typography></li>
              <li><Typography variant="body2" color="text.secondary"><strong>Usage Data:</strong> Information about how you interact with the Service, including pages visited, features used, and session duration.</Typography></li>
            </Box>
          </Section>

          <Section title="3. How We Use Your Information">
            <Box component="ul" sx={{ pl: 2.5, '& li': { mb: 1 } }}>
              <li><Typography variant="body2" color="text.secondary">To provide and maintain our Service (cutoff calculator, college predictor, exam center locator)</Typography></li>
              <li><Typography variant="body2" color="text.secondary">To authenticate your identity and secure your account</Typography></li>
              <li><Typography variant="body2" color="text.secondary">To process payments for premium features</Typography></li>
              <li><Typography variant="body2" color="text.secondary">To provide location-based recommendations and nearby exam centers</Typography></li>
              <li><Typography variant="body2" color="text.secondary">To diagnose and fix technical issues using crash logs and error reports</Typography></li>
              <li><Typography variant="body2" color="text.secondary">To send important updates about the Service</Typography></li>
              <li><Typography variant="body2" color="text.secondary">To improve our tools and user experience</Typography></li>
            </Box>
          </Section>

          <Section title="4. Third-Party Services">
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              We use the following third-party services to operate our platform:
            </Typography>
            <Box component="ul" sx={{ pl: 2.5, '& li': { mb: 1 } }}>
              <li><Typography variant="body2" color="text.secondary"><strong>Google Firebase:</strong> For authentication (Google Sign-In and phone OTP verification)</Typography></li>
              <li><Typography variant="body2" color="text.secondary"><strong>Supabase:</strong> For secure data storage and database management</Typography></li>
              <li><Typography variant="body2" color="text.secondary"><strong>Razorpay:</strong> For payment processing (governed by Razorpay&apos;s privacy policy)</Typography></li>
              <li><Typography variant="body2" color="text.secondary"><strong>Vercel:</strong> For hosting and content delivery</Typography></li>
            </Box>
          </Section>

          <Section title="5. Data Security">
            <Typography variant="body2" color="text.secondary">
              We implement industry-standard security measures to protect your data, including encrypted
              connections (HTTPS), secure authentication tokens, and role-based access controls. However,
              no method of electronic storage is 100% secure.
            </Typography>
          </Section>

          <Section title="6. Data Retention">
            <Typography variant="body2" color="text.secondary">
              We retain your personal data for as long as your account is active or as needed to provide
              the Service. You may request deletion of your account and associated data at any time by
              visiting our account deletion page or contacting us.
            </Typography>
          </Section>

          <Section title="7. Your Rights">
            <Box component="ul" sx={{ pl: 2.5, '& li': { mb: 1 } }}>
              <li><Typography variant="body2" color="text.secondary">Access your personal data stored with us</Typography></li>
              <li><Typography variant="body2" color="text.secondary">Request correction of inaccurate data</Typography></li>
              <li><Typography variant="body2" color="text.secondary">Request deletion of your account and data</Typography></li>
              <li><Typography variant="body2" color="text.secondary">Withdraw consent for data processing (including location tracking)</Typography></li>
            </Box>
          </Section>

          <Section title="8. Children&apos;s Privacy">
            <Typography variant="body2" color="text.secondary">
              Our Service is intended for students aged 13 and above. We do not knowingly collect
              personal information from children under 13. If you believe we have collected data from a
              child under 13, please contact us immediately.
            </Typography>
          </Section>

          <Section title="9. Changes to This Policy">
            <Typography variant="body2" color="text.secondary">
              We may update this Privacy Policy from time to time. We will notify you of any changes by
              updating the &quot;Last updated&quot; date at the top of this page.
            </Typography>
          </Section>

          <Section title="10. Contact Us">
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              If you have any questions about this Privacy Policy or wish to exercise your rights,
              please contact us at:
            </Typography>
            <Box component="ul" sx={{ pl: 2.5, '& li': { mb: 0.5 } }}>
              <li><Typography variant="body2" color="text.secondary"><strong>Email:</strong> support@neramclasses.com</Typography></li>
              <li><Typography variant="body2" color="text.secondary"><strong>Website:</strong> neramclasses.com</Typography></li>
            </Box>
          </Section>
        </Paper>
      </Container>
    </Box>
  );
}
