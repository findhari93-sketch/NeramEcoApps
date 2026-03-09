import type { Metadata } from 'next';
import { Container, Typography, Box, Paper, Button } from '@mui/material';

export const metadata: Metadata = {
  title: 'Delete Account',
  description: 'Request deletion of your aiArchitek account and associated data',
};

export default function DeleteAccountPage() {
  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Paper sx={{ p: { xs: 3, md: 5 } }}>
        <Typography variant="h4" component="h1" gutterBottom fontWeight={700}>
          Delete Your Account
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          aiArchitek by Neram Classes
        </Typography>

        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" component="h2" fontWeight={600} gutterBottom>
            What happens when you delete your account?
          </Typography>
          <Box component="ul" sx={{ pl: 3, mb: 3 }}>
            <li><Typography>Your profile information (name, email, phone number) will be permanently deleted</Typography></li>
            <li><Typography>Your saved preferences and tool history will be removed</Typography></li>
            <li><Typography>Your Firebase authentication credentials will be revoked</Typography></li>
            <li><Typography>Any payment records will be retained as required by Indian tax law, but de-identified</Typography></li>
            <li><Typography>This action is <strong>irreversible</strong> — you cannot recover your account after deletion</Typography></li>
          </Box>

          <Typography variant="h6" component="h2" fontWeight={600} gutterBottom>
            How to request account deletion
          </Typography>
          <Typography sx={{ mb: 2 }}>
            Send an email to the address below from the email associated with your account.
            Include &quot;Delete My Account&quot; in the subject line. We will process your request
            within 7 business days and confirm deletion via email.
          </Typography>

          <Button
            variant="contained"
            color="error"
            size="large"
            href="mailto:support@neramclasses.com?subject=Delete%20My%20Account&body=Please%20delete%20my%20aiArchitek%20account%20and%20all%20associated%20data.%0A%0AMy%20registered%20email%3A%20%0AMy%20registered%20phone%3A%20"
            fullWidth
            sx={{ mt: 1, mb: 3, py: 1.5 }}
          >
            Request Account Deletion
          </Button>

          <Typography variant="body2" color="text.secondary">
            Email: support@neramclasses.com
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Data deletion timeline: Within 7 business days of receiving your request.
            You will receive a confirmation email once your account and data have been deleted.
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
}
