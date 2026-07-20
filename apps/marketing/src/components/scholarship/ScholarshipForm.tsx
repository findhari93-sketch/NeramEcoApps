'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Alert,
  CircularProgress,
  Chip,
  ImageUploadField,
} from '@neram/ui';

interface UploadedDoc {
  url: string;
  fileName: string;
  type: string;
}

interface ScholarshipFormProps {
  /** Already uploaded docs (for resubmission) */
  existingDocs?: {
    school_id_card_url?: string | null;
    income_certificate_url?: string | null;
    aadhar_card_url?: string | null;
    mark_sheet_url?: string | null;
  };
  /** Whether this is a resubmission */
  isResubmission?: boolean;
  /** Auth token for API calls */
  getAuthToken: () => Promise<string | null>;
  /** Callback on successful submission */
  onSubmitted: () => void;
  /** Translation function */
  t: (key: string) => string;
}

interface DocumentField {
  key: 'school_id_card' | 'income_certificate' | 'aadhar_card' | 'mark_sheet';
  labelKey: string;
  descKey: string;
  required: boolean;
}

const DOCUMENT_FIELDS: DocumentField[] = [
  {
    key: 'school_id_card',
    labelKey: 'schoolIdCard',
    descKey: 'schoolIdCardDesc',
    required: true,
  },
  {
    key: 'income_certificate',
    labelKey: 'incomeCertificate',
    descKey: 'incomeCertificateDesc',
    required: true,
  },
  {
    key: 'aadhar_card',
    labelKey: 'aadharCard',
    descKey: 'aadharCardDesc',
    required: true,
  },
  {
    key: 'mark_sheet',
    labelKey: 'markSheet',
    descKey: 'markSheetDesc',
    required: false,
  },
];

export default function ScholarshipForm({
  existingDocs,
  isResubmission = false,
  getAuthToken,
  onSubmitted,
  t,
}: ScholarshipFormProps) {
  const [uploads, setUploads] = useState<Record<string, UploadedDoc | null>>({
    school_id_card: existingDocs?.school_id_card_url
      ? { url: existingDocs.school_id_card_url, fileName: 'School ID Card', type: 'school_id_card' }
      : null,
    income_certificate: existingDocs?.income_certificate_url
      ? { url: existingDocs.income_certificate_url, fileName: 'Income Certificate', type: 'income_certificate' }
      : null,
    aadhar_card: existingDocs?.aadhar_card_url
      ? { url: existingDocs.aadhar_card_url, fileName: 'Aadhar Card', type: 'aadhar_card' }
      : null,
    mark_sheet: existingDocs?.mark_sheet_url
      ? { url: existingDocs.mark_sheet_url, fileName: 'Mark Sheet', type: 'mark_sheet' }
      : null,
  });

  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Injected uploader factory for the shared ImageUploadField.
  // Same endpoint/auth (Firebase idToken via getAuthToken) as before; returns { url }.
  // We keep a per-field `uploading` flag so the submit button stays disabled mid-upload.
  const makeUpload = (docType: string) => async (file: File): Promise<{ url: string }> => {
    setUploading((prev) => ({ ...prev, [docType]: true }));
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', docType);

      const response = await fetch('/api/scholarship/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      return { url: result.url };
    } finally {
      setUploading((prev) => ({ ...prev, [docType]: false }));
    }
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    setSubmitting(true);

    try {
      // Validate required docs
      const missingRequired = DOCUMENT_FIELDS.filter(
        (field) => field.required && !uploads[field.key]
      );

      if (missingRequired.length > 0) {
        setSubmitError(
          `Please upload: ${missingRequired.map((f) => t(f.labelKey)).join(', ')}`
        );
        setSubmitting(false);
        return;
      }

      const token = await getAuthToken();
      if (!token) {
        setSubmitError('Not authenticated. Please log in again.');
        setSubmitting(false);
        return;
      }

      const payload = {
        school_id_card_url: uploads.school_id_card?.url || null,
        income_certificate_url: uploads.income_certificate?.url || null,
        aadhar_card_url: uploads.aadhar_card?.url || null,
        mark_sheet_url: uploads.mark_sheet?.url || null,
      };

      const response = await fetch('/api/scholarship', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Submission failed');
      }

      setSubmitSuccess(true);
      onSubmitted();
    } catch (error: any) {
      setSubmitError(error.message || t('submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitSuccess) {
    return (
      <Alert severity="success" sx={{ mb: 3 }}>
        <Typography variant="body2" fontWeight={600}>
          {t('submitSuccess')}
        </Typography>
      </Alert>
    );
  }

  const allRequiredUploaded = DOCUMENT_FIELDS.filter((f) => f.required).every(
    (field) => uploads[field.key]
  );
  const anyUploading = Object.values(uploading).some(Boolean);

  return (
    <Box>
      <Typography variant="h6" gutterBottom fontWeight={600}>
        {isResubmission ? t('resubmitDocuments') : t('uploadDocuments')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t('maxSize')}
      </Typography>

      {/* Document Upload Cards */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
        {DOCUMENT_FIELDS.map((field) => {
          const doc = uploads[field.key];

          return (
            <Card
              key={field.key}
              variant="outlined"
              sx={{
                borderColor: doc ? 'success.main' : 'divider',
                transition: 'border-color 0.2s',
              }}
            >
              <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: 2 } }}>
                <Box
                  display="flex"
                  justifyContent="space-between"
                  alignItems="flex-start"
                  mb={1}
                >
                  <Box>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography variant="subtitle2" fontWeight={600}>
                        {t(field.labelKey)}
                      </Typography>
                      <Chip
                        label={field.required ? t('required') : t('optional')}
                        size="small"
                        color={field.required ? 'error' : 'default'}
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.65rem' }}
                      />
                    </Box>
                    <Typography variant="caption" color="text.secondary" component="p">
                      {t(field.descKey)}
                    </Typography>
                  </Box>
                </Box>

                <ImageUploadField
                  value={doc?.url || null}
                  onChange={(url) =>
                    setUploads((prev) => ({
                      ...prev,
                      [field.key]: url
                        ? { url, fileName: t(field.labelKey), type: field.key }
                        : null,
                    }))
                  }
                  upload={makeUpload(field.key)}
                  accept="image/*,.pdf"
                  maxSizeMB={5}
                />
              </CardContent>
            </Card>
          );
        })}
      </Box>

      {/* Submit Error */}
      {submitError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSubmitError(null)}>
          {submitError}
        </Alert>
      )}

      {/* Submit Button */}
      <Button
        variant="contained"
        size="large"
        onClick={handleSubmit}
        disabled={!allRequiredUploaded || anyUploading || submitting}
        fullWidth
        sx={{ minHeight: 52 }}
      >
        {submitting ? (
          <>
            <CircularProgress size={20} sx={{ mr: 1 }} color="inherit" />
            {t('submitting')}
          </>
        ) : isResubmission ? (
          t('resubmitDocuments')
        ) : (
          t('submitApplication')
        )}
      </Button>
    </Box>
  );
}
