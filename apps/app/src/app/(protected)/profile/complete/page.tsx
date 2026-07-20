// @ts-nocheck
'use client';

import { useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Button,
  Alert,
  CircularProgress,
} from '@neram/ui';
import { ImageUploadField } from '@neram/ui';
import {
  CheckCircleOutlined,
  CreditCard,
  AccountBox,
  ArrowBack,
} from '@mui/icons-material';
import { useFirebaseAuth } from '@neram/auth';
import { useRouter } from 'next/navigation';

interface UploadState {
  file: File | null;
  preview: string | null;
  uploading: boolean;
  uploaded: boolean;
  error: string | null;
}

const initialUploadState: UploadState = {
  file: null,
  preview: null,
  uploading: false,
  uploaded: false,
  error: null,
};

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

export default function CompleteProfilePage() {
  const { user } = useFirebaseAuth();
  const router = useRouter();
  const [aadhar, setAadhar] = useState<UploadState>(initialUploadState);
  const [photo, setPhoto] = useState<UploadState>(initialUploadState);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // The shared ImageUploadField picks the file (click + drop + CLIPBOARD PASTE)
  // and hands it to us. We keep the File in state for the batched submit below,
  // and use a data URL as the field's preview value. Validation (image type +
  // size) is handled by the field itself.
  const pickInto =
    (setter: React.Dispatch<React.SetStateAction<UploadState>>) =>
    async (file: File): Promise<{ url: string }> => {
      const preview = await readFileAsDataURL(file);
      setter({ file, preview, uploading: false, uploaded: false, error: null });
      return { url: preview };
    };

  const handleSubmit = async () => {
    if (!user) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const idToken = await user.getIdToken();
      const formData = new FormData();

      if (aadhar.file) formData.append('aadhar', aadhar.file);
      if (photo.file) formData.append('photo', photo.file);

      const res = await fetch('/api/profile/documents', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to upload documents. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
        <CheckCircleOutlined sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Profile Complete!
        </Typography>
        <Typography color="text.secondary" mb={3}>
          Your documents have been uploaded successfully.
        </Typography>
        <Button
          variant="contained"
          onClick={() => router.push('/dashboard')}
          sx={{ borderRadius: 1, fontWeight: 600 }}
        >
          Go to Dashboard
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 2, md: 4 } }}>
      <Button
        startIcon={<ArrowBack />}
        onClick={() => router.push('/dashboard')}
        sx={{ mb: 2, textTransform: 'none' }}
      >
        Back to Dashboard
      </Button>

      <Typography variant="h5" fontWeight={700} gutterBottom>
        Complete Your Profile
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Upload your Aadhar card and passport photograph to complete your enrollment.
      </Typography>

      {submitError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSubmitError(null)}>
          {submitError}
        </Alert>
      )}

      {/* Aadhar Card Upload */}
      <Paper
        elevation={0}
        sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
      >
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <CreditCard color="primary" />
          <Typography variant="subtitle1" fontWeight={600}>
            Aadhar Card
          </Typography>
        </Box>

        <ImageUploadField
          value={aadhar.preview}
          onChange={(url) => { if (!url) setAadhar(initialUploadState); }}
          upload={pickInto(setAadhar)}
          accept="image/*"
          maxSizeMB={5}
          helperText="Tap to upload Aadhar card (front side)"
        />
      </Paper>

      {/* Passport Photo Upload */}
      <Paper
        elevation={0}
        sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
      >
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <AccountBox color="primary" />
          <Typography variant="subtitle1" fontWeight={600}>
            Passport-Sized Photograph
          </Typography>
        </Box>

        <ImageUploadField
          value={photo.preview}
          onChange={(url) => { if (!url) setPhoto(initialUploadState); }}
          upload={pickInto(setPhoto)}
          accept="image/*"
          maxSizeMB={5}
          helperText="Tap to upload passport-sized photograph"
        />
      </Paper>

      {/* Actions */}
      <Box display="flex" gap={2}>
        <Button
          variant="outlined"
          fullWidth
          onClick={() => router.push('/dashboard')}
          sx={{ borderRadius: 1, py: 1.2 }}
        >
          Skip for Now
        </Button>
        <Button
          variant="contained"
          fullWidth
          onClick={handleSubmit}
          disabled={(!aadhar.file && !photo.file) || submitting}
          sx={{ borderRadius: 1, py: 1.2, fontWeight: 600 }}
        >
          {submitting ? (
            <>
              <CircularProgress size={20} sx={{ mr: 1 }} color="inherit" />
              Uploading...
            </>
          ) : (
            'Submit Documents'
          )}
        </Button>
      </Box>
    </Container>
  );
}
