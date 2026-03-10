import type { Metadata } from 'next';
import { Container, Typography, Box, Paper, Button, Divider } from '@neram/ui';

export const metadata: Metadata = {
  title: 'Delete Account',
  description: 'Request deletion of your aiArchitek account and associated data',
};

export default function DeleteAccountPage() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
      }}
    >
      <Container
        maxWidth="sm"
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          py: { xs: 4, md: 8 },
        }}
      >
        <Paper elevation={3} sx={{ p: { xs: 3, md: 4 }, borderRadius: 1.5 }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Typography
              variant="h5"
              component="h1"
              sx={{ fontWeight: 600, fontSize: { xs: '1.5rem', md: '1.75rem' } }}
            >
              Delete Your Account
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              aiArchitek by Neram Classes
            </Typography>
          </Box>

          <Divider sx={{ mb: 3 }} />

          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
            What happens when you delete your account?
          </Typography>
          <Box component="ul" sx={{ pl: 2.5, mb: 3, '& li': { mb: 1 } }}>
            <li>
              <Typography variant="body2">
                Your profile information (name, email, phone number) will be permanently deleted
              </Typography>
            </li>
            <li>
              <Typography variant="body2">
                Your saved preferences and tool history will be removed
              </Typography>
            </li>
            <li>
              <Typography variant="body2">
                Your Firebase authentication credentials will be revoked
              </Typography>
            </li>
            <li>
              <Typography variant="body2">
                Payment records will be retained as required by Indian tax law, but de-identified
              </Typography>
            </li>
            <li>
              <Typography variant="body2">
                This action is <strong>irreversible</strong> — you cannot recover your account after deletion
              </Typography>
            </li>
          </Box>

          <Divider sx={{ mb: 3 }} />

          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
            How to request account deletion
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            Send an email from the email associated with your account. Include &quot;Delete My
            Account&quot; in the subject line. We will process your request within 7 business days
            and confirm deletion via email.
          </Typography>

          <Button
            variant="contained"
            color="error"
            size="large"
            href="mailto:support@neramclasses.com?subject=Delete%20My%20Account&body=Please%20delete%20my%20aiArchitek%20account%20and%20all%20associated%20data.%0A%0AMy%20registered%20email%3A%20%0AMy%20registered%20phone%3A%20"
            fullWidth
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 1.5,
              py: 1.5,
              fontSize: '0.9375rem',
              mb: 2,
            }}
          >
            Request Account Deletion
          </Button>

          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              Email: support@neramclasses.com
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
              Deletion timeline: Within 7 business days
            </Typography>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
