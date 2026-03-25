'use client';

import { useState, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  IconButton,
  Chip,
  LinearProgress,
  Alert,
  Link,
} from '@neram/ui';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import CropOutlinedIcon from '@mui/icons-material/CropOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

const IMAGE_DROPPER_URL = 'https://app.neramclasses.com/tools/nata/image-crop';

// Templates that need the Image Dropper link
const NEEDS_CROP = ['Passport Photo', 'Signature'];

interface DocumentsStepProps {
  classroomId: string;
  templates: any[];
  uploadedDocs: any[];
  getToken: () => Promise<string | null>;
  onNext: () => void;
  onDocsChange: (docs: any[]) => void;
}

export default function DocumentsStep({
  classroomId,
  templates,
  uploadedDocs,
  getToken,
  onNext,
  onDocsChange,
}: DocumentsStepProps) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  // Check if all required templates have uploads
  const allUploaded = templates.every((t: any) =>
    uploadedDocs.some((d: any) => d.template_id === t.id)
  );

  const handleUploadClick = (templateId: string) => {
    setActiveTemplateId(templateId);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeTemplateId) return;

    setUploading(activeTemplateId);
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const template = templates.find((t: any) => t.id === activeTemplateId);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('classroom_id', classroomId);
      formData.append('template_id', activeTemplateId);
      formData.append('title', template?.name || 'Document');
      formData.append('category', template?.category || 'identity');

      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Upload failed');
      }

      const data = await res.json();

      // Update uploaded docs list
      const newDoc = data.document || data;
      onDocsChange([
        ...uploadedDocs.filter((d: any) => d.template_id !== activeTemplateId),
        { ...newDoc, template_id: activeTemplateId },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(null);
      setActiveTemplateId(null);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 700 }}>
        Upload Identity Documents
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        All 3 documents are required to proceed. They will be reviewed by an admin.
      </Typography>

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Document cards */}
      {templates.map((template: any) => {
        const uploaded = uploadedDocs.find((d: any) => d.template_id === template.id);
        const isUploading = uploading === template.id;
        const needsCrop = NEEDS_CROP.includes(template.name);

        return (
          <Paper
            key={template.id}
            elevation={0}
            sx={{
              p: 2,
              borderRadius: 2,
              border: '1px solid',
              borderColor: uploaded ? 'success.light' : 'divider',
              bgcolor: uploaded ? 'success.50' : 'background.paper',
              transition: 'all 0.2s',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {/* Status icon */}
              {uploaded ? (
                <CheckCircleOutlinedIcon sx={{ color: 'success.main', fontSize: 28 }} />
              ) : (
                <CloudUploadOutlinedIcon sx={{ color: 'text.disabled', fontSize: 28 }} />
              )}

              {/* Info */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {template.name}
                  </Typography>
                  <Chip label="Required" size="small" color="error" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                </Box>
                {uploaded ? (
                  <Typography variant="caption" color="success.main" sx={{ fontWeight: 500 }}>
                    Uploaded — Pending review
                  </Typography>
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    {template.description || 'Upload image or PDF'}
                  </Typography>
                )}
              </Box>

              {/* Actions */}
              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                {uploaded && (
                  <IconButton
                    size="small"
                    onClick={() => {
                      if (uploaded.file_url) window.open(uploaded.file_url, '_blank');
                    }}
                  >
                    <VisibilityOutlinedIcon fontSize="small" />
                  </IconButton>
                )}
                <Button
                  variant={uploaded ? 'outlined' : 'contained'}
                  size="small"
                  disabled={isUploading}
                  onClick={() => handleUploadClick(template.id)}
                  sx={{ minWidth: 80, textTransform: 'none', borderRadius: 1.5 }}
                >
                  {isUploading ? 'Uploading...' : uploaded ? 'Re-upload' : 'Upload'}
                </Button>
              </Box>
            </Box>

            {isUploading && <LinearProgress sx={{ mt: 1, borderRadius: 1 }} />}

            {/* Image Dropper link for passport photo & signature */}
            {needsCrop && !uploaded && (
              <Box
                sx={{
                  mt: 1.5,
                  p: 1.5,
                  borderRadius: 1.5,
                  bgcolor: 'info.50',
                  border: '1px solid',
                  borderColor: 'info.100',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <CropOutlinedIcon sx={{ color: 'info.main', fontSize: 18 }} />
                <Typography variant="caption" color="info.dark">
                  Need to resize?{' '}
                  <Link
                    href={IMAGE_DROPPER_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ fontWeight: 600 }}
                  >
                    Use Image Dropper
                  </Link>
                  {' '}to crop and resize before uploading.
                </Typography>
              </Box>
            )}
          </Paper>
        );
      })}

      {/* Next button */}
      <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
        <Button
          variant="contained"
          size="large"
          fullWidth
          disabled={!allUploaded}
          onClick={onNext}
          sx={{ py: 1.5, borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
        >
          {allUploaded ? 'Continue' : `Upload all ${templates.length} documents to continue`}
        </Button>
      </Box>
    </Box>
  );
}
