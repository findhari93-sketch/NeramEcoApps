'use client';

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Chip,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import ImageIcon from '@mui/icons-material/Image';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DownloadIcon from '@mui/icons-material/Download';

interface Document {
  id: string;
  documentType: string;
  fileUrl: string;
  fileName: string;
  isVerified: boolean;
  uploadedAt: string;
}

interface DocumentViewerProps {
  documents: Document[];
  onVerify?: (docId: string, verified: boolean) => void;
  showActions?: boolean;
}

const documentTypeLabels: Record<string, string> = {
  school_id_card: 'School ID Card',
  income_certificate: 'Income Certificate',
  payment_screenshot: 'Payment Screenshot',
  aadhar_card: 'Aadhar Card',
  marksheet: 'Marksheet',
  photo: 'Photo',
  signature: 'Signature',
  other: 'Other',
};

export default function DocumentViewer({
  documents,
  onVerify,
  showActions = true,
}: DocumentViewerProps) {
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const isPdf = (url: string) => url.toLowerCase().endsWith('.pdf');

  const handlePreview = (doc: Document) => {
    setSelectedDoc(doc);
    setPreviewOpen(true);
  };

  const handleDownload = (doc: Document) => {
    window.open(doc.fileUrl, '_blank');
  };

  if (documents.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">No documents uploaded</Typography>
      </Paper>
    );
  }

  return (
    <>
      <Grid container spacing={2}>
        {documents.map((doc) => (
          <Grid item xs={12} sm={6} md={4} key={doc.id}>
            <Paper
              sx={{
                p: 2,
                border: '1px solid',
                borderColor: doc.isVerified ? 'success.light' : 'grey.300',
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': {
                  borderColor: 'primary.main',
                  boxShadow: 2,
                },
              }}
              onClick={() => handlePreview(doc)}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                {isPdf(doc.fileUrl) ? (
                  <PictureAsPdfIcon color="error" />
                ) : (
                  <ImageIcon color="primary" />
                )}
                <Typography variant="subtitle2" noWrap sx={{ flex: 1 }}>
                  {documentTypeLabels[doc.documentType] || doc.documentType}
                </Typography>
                {doc.isVerified ? (
                  <CheckCircleIcon color="success" fontSize="small" />
                ) : (
                  <ErrorIcon color="warning" fontSize="small" />
                )}
              </Box>

              <Typography variant="caption" color="text.secondary" noWrap display="block">
                {doc.fileName}
              </Typography>

              <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                <Chip
                  size="small"
                  label={doc.isVerified ? 'Verified' : 'Pending'}
                  color={doc.isVerified ? 'success' : 'warning'}
                />
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Preview Dialog */}
      <Dialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">
            {selectedDoc && (documentTypeLabels[selectedDoc.documentType] || selectedDoc.documentType)}
          </Typography>
          <IconButton onClick={() => setPreviewOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {selectedDoc && (
            <Box>
              {isPdf(selectedDoc.fileUrl) ? (
                <Box sx={{ height: 500 }}>
                  <iframe
                    src={selectedDoc.fileUrl}
                    width="100%"
                    height="100%"
                    title={selectedDoc.fileName}
                    style={{ border: 'none' }}
                  />
                </Box>
              ) : (
                <Box
                  component="img"
                  src={selectedDoc.fileUrl}
                  alt={selectedDoc.fileName}
                  sx={{
                    width: '100%',
                    maxHeight: 500,
                    objectFit: 'contain',
                  }}
                />
              )}

              {showActions && (
                <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
                  <Button
                    variant="outlined"
                    startIcon={<DownloadIcon />}
                    onClick={() => handleDownload(selectedDoc)}
                  >
                    Download
                  </Button>
                  {onVerify && !selectedDoc.isVerified && (
                    <Button
                      variant="contained"
                      color="success"
                      startIcon={<CheckCircleIcon />}
                      onClick={() => {
                        onVerify(selectedDoc.id, true);
                        setPreviewOpen(false);
                      }}
                    >
                      Mark as Verified
                    </Button>
                  )}
                  {onVerify && selectedDoc.isVerified && (
                    <Button
                      variant="outlined"
                      color="warning"
                      startIcon={<ErrorIcon />}
                      onClick={() => {
                        onVerify(selectedDoc.id, false);
                        setPreviewOpen(false);
                      }}
                    >
                      Mark as Unverified
                    </Button>
                  )}
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
