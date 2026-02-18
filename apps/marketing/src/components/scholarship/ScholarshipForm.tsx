'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Alert,
  CircularProgress,
  Chip,
  IconButton,
  LinearProgress,
} from '@neram/ui';
import {
  CloudUploadOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  DescriptionOutlined,
  ImageOutlined,
  PictureAsPdfOutlined,
} from '@mui/icons-material';

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

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'pdf'];

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

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return <PictureAsPdfOutlined color="error" />;
  if (['jpg', 'jpeg', 'png'].includes(ext || '')) return <ImageOutlined color="primary" />;
  return <DescriptionOutlined color="action" />;
}

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
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleFileSelect = useCallback(
    async (docType: string, file: File) => {
      // Validate extension
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
        setUploadErrors((prev) => ({
          ...prev,
          [docType]: t('invalidFormat'),
        }));
        return;
      }

      // Validate size
      if (file.size > MAX_FILE_SIZE) {
        setUploadErrors((prev) => ({
          ...prev,
          [docType]: t('fileTooLarge'),
        }));
        return;
      }

      // Clear errors
      setUploadErrors((prev) => ({ ...prev, [docType]: '' }));
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

        setUploads((prev) => ({
          ...prev,
          [docType]: {
            url: result.url,
            fileName: file.name,
            type: docType,
          },
        }));
      } catch (error: any) {
        setUploadErrors((prev) => ({
          ...prev,
          [docType]: error.message || t('uploadError'),
        }));
      } finally {
        setUploading((prev) => ({ ...prev, [docType]: false }));
      }
    },
    [getAuthToken, t]
  );

  const handleRemoveDoc = (docType: string) => {
    setUploads((prev) => ({ ...prev, [docType]: null }));
    setUploadErrors((prev) => ({ ...prev, [docType]: '' }));
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
          const isFieldUploading = uploading[field.key];
          const error = uploadErrors[field.key];

          return (
            <Card
              key={field.key}
              variant="outlined"
              sx={{
                borderColor: error
                  ? 'error.main'
                  : doc
                  ? 'success.main'
                  : 'divider',
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

                {/* Upload progress */}
                {isFieldUploading && (
                  <Box sx={{ mb: 1.5 }}>
                    <LinearProgress />
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                      {t('uploading')}
                    </Typography>
                  </Box>
                )}

                {/* Uploaded file */}
                {doc && !isFieldUploading && (
                  <Box
                    display="flex"
                    alignItems="center"
                    gap={1}
                    sx={{
                      p: 1,
                      borderRadius: 1,
                      bgcolor: 'success.50',
                      border: 1,
                      borderColor: 'success.200',
                      mb: 1,
                    }}
                  >
                    {getFileIcon(doc.fileName)}
                    <Box flex={1} minWidth={0}>
                      <Typography
                        variant="body2"
                        fontWeight={500}
                        noWrap
                        title={doc.fileName}
                      >
                        {doc.fileName}
                      </Typography>
                      <Typography variant="caption" color="success.main">
                        <CheckCircleOutlined sx={{ fontSize: 12, mr: 0.5, verticalAlign: 'middle' }} />
                        {t('uploadSuccess')}
                      </Typography>
                    </Box>
                    <IconButton
                      size="small"
                      onClick={() => handleRemoveDoc(field.key)}
                      sx={{ color: 'text.secondary' }}
                    >
                      <DeleteOutlined fontSize="small" />
                    </IconButton>
                  </Box>
                )}

                {/* Error message */}
                {error && (
                  <Typography variant="caption" color="error" sx={{ mb: 1, display: 'block' }}>
                    {error}
                  </Typography>
                )}

                {/* Upload button */}
                {!doc && !isFieldUploading && (
                  <Button
                    variant="outlined"
                    startIcon={<CloudUploadOutlined />}
                    onClick={() => fileInputRefs.current[field.key]?.click()}
                    fullWidth
                    sx={{
                      minHeight: 48,
                      borderStyle: 'dashed',
                      textTransform: 'none',
                    }}
                  >
                    Upload {t(field.labelKey)}
                  </Button>
                )}

                {/* Replace button when already uploaded */}
                {doc && !isFieldUploading && (
                  <Button
                    variant="text"
                    size="small"
                    startIcon={<CloudUploadOutlined />}
                    onClick={() => fileInputRefs.current[field.key]?.click()}
                    sx={{ textTransform: 'none' }}
                  >
                    Replace
                  </Button>
                )}

                {/* Hidden file input */}
                <input
                  ref={(el) => {
                    fileInputRefs.current[field.key] = el;
                  }}
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleFileSelect(field.key, file);
                      // Reset input so same file can be re-selected
                      e.target.value = '';
                    }
                  }}
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
