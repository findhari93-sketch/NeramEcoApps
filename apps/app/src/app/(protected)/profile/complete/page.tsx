// @ts-nocheck
'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Button,
  Alert,
  CircularProgress,
  IconButton,
} from '@neram/ui';
import {
  CloudUpload,
  CheckCircleOutlined,
  DeleteOutlined,
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

export default function CompleteProfilePage() {
  const { user } = useFirebaseAuth();
  const router = useRouter();
  const [aadhar, setAadhar] = useState<UploadState>(initialUploadState);
  const [photo, setPhoto] = useState<UploadState>(initialUploadState);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const aadharInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((
    event: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<UploadState>>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      setter((prev) => ({ ...prev, error: 'Please select an image file (JPG, PNG)' }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setter((prev) => ({ ...prev, error: 'File size must be less than 5MB' }));
      return;
    }

    const preview = URL.createObjectURL(file);
    setter({ file, preview, uploading: false, uploaded: false, error: null });
  }, []);

  const handleRemove = useCallback((
    setter: React.Dispatch<React.SetStateAction<UploadState>>,
    inputRef: React.RefObject<HTMLInputElement>
  ) => {
    setter(initialUploadState);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

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

        {aadhar.preview ? (
          <Box position="relative" mb={1}>
            <img
              src={aadhar.preview}
              alt="Aadhar card preview"
              style={{
                width: '100%',
                maxHeight: 200,
                objectFit: 'contain',
                borderRadius: 8,
                border: '1px solid #e0e0e0',
              }}
            />
            <IconButton
              size="small"
              onClick={() => handleRemove(setAadhar, aadharInputRef)}
              sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'background.paper' }}
            >
              <DeleteOutlined fontSize="small" />
            </IconButton>
          </Box>
        ) : (
          <Box
            onClick={() => aadharInputRef.current?.click()}
            sx={{
              border: '2px dashed',
              borderColor: 'grey.300',
              borderRadius: 2,
              p: 4,
              textAlign: 'center',
              cursor: 'pointer',
              '&:hover': { borderColor: 'primary.main', bgcolor: 'primary.50' },
              transition: 'all 0.2s',
            }}
          >
            <CloudUpload sx={{ fontSize: 40, color: 'grey.400', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              Tap to upload Aadhar card (front side)
            </Typography>
            <Typography variant="caption" color="text.secondary">
              JPG, PNG - Max 5MB
            </Typography>
          </Box>
        )}

        <input
          ref={aadharInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => handleFileSelect(e, setAadhar)}
        />
        {aadhar.error && (
          <Alert severity="error" sx={{ mt: 1 }}>{aadhar.error}</Alert>
        )}
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

        {photo.preview ? (
          <Box position="relative" mb={1} display="flex" justifyContent="center">
            <img
              src={photo.preview}
              alt="Passport photo preview"
              style={{
                width: 150,
                height: 200,
                objectFit: 'cover',
                borderRadius: 8,
                border: '1px solid #e0e0e0',
              }}
            />
            <IconButton
              size="small"
              onClick={() => handleRemove(setPhoto, photoInputRef)}
              sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'background.paper' }}
            >
              <DeleteOutlined fontSize="small" />
            </IconButton>
          </Box>
        ) : (
          <Box
            onClick={() => photoInputRef.current?.click()}
            sx={{
              border: '2px dashed',
              borderColor: 'grey.300',
              borderRadius: 2,
              p: 4,
              textAlign: 'center',
              cursor: 'pointer',
              '&:hover': { borderColor: 'primary.main', bgcolor: 'primary.50' },
              transition: 'all 0.2s',
            }}
          >
            <CloudUpload sx={{ fontSize: 40, color: 'grey.400', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              Tap to upload passport-sized photograph
            </Typography>
            <Typography variant="caption" color="text.secondary">
              JPG, PNG - Max 5MB
            </Typography>
          </Box>
        )}

        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => handleFileSelect(e, setPhoto)}
        />
        {photo.error && (
          <Alert severity="error" sx={{ mt: 1 }}>{photo.error}</Alert>
        )}
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
