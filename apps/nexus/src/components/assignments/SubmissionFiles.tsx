'use client';

/**
 * Renders a submission's files (signed URLs). Images open in a lightbox; PDFs
 * open in a viewer dialog with an "Open in new tab" fallback (iOS Safari does
 * not always render a PDF inside an iframe).
 */
import { useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  IconButton,
  Dialog,
  Button,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import { ImageViewerDialog } from '@neram/ui';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

export interface SubmissionFile {
  path: string;
  name: string;
  mime: string;
  url?: string | null;
}

export default function SubmissionFiles({ files }: { files: SubmissionFile[] }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [image, setImage] = useState<SubmissionFile | null>(null);
  const [pdf, setPdf] = useState<SubmissionFile | null>(null);

  if (!files.length) {
    return (
      <Typography variant="body2" color="text.disabled">
        No files.
      </Typography>
    );
  }

  return (
    <>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {files.map((f) => {
          const isPdf = f.mime === 'application/pdf';
          if (isPdf) {
            return (
              <Box
                key={f.path}
                role="button"
                onClick={() => f.url && setPdf(f)}
                sx={{
                  width: 92,
                  height: 92,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 0.5,
                  cursor: 'pointer',
                  bgcolor: 'action.hover',
                  '&:hover': { borderColor: 'primary.light' },
                }}
              >
                <PictureAsPdfOutlinedIcon sx={{ fontSize: 28, color: '#C62828' }} />
                <Typography variant="caption" color="text.secondary">
                  PDF
                </Typography>
              </Box>
            );
          }
          return (
            <Box
              key={f.path}
              component="img"
              src={f.url || ''}
              alt={f.name}
              onClick={() => f.url && setImage(f)}
              sx={{
                width: 92,
                height: 92,
                objectFit: 'cover',
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                cursor: 'pointer',
                bgcolor: 'grey.100',
              }}
            />
          );
        })}
      </Stack>

      <ImageViewerDialog
        open={!!image}
        onClose={() => setImage(null)}
        src={image?.url || ''}
        name={image?.name}
      />

      <Dialog open={!!pdf} onClose={() => setPdf(null)} fullScreen={fullScreen} maxWidth="md" fullWidth>
        <Stack direction="row" alignItems="center" sx={{ p: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, px: 1 }} noWrap>
            {pdf?.name}
          </Typography>
          {pdf?.url && (
            <Button
              size="small"
              startIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
              href={pdf.url}
              target="_blank"
              rel="noopener"
              sx={{ minHeight: 40 }}
            >
              Open
            </Button>
          )}
          <IconButton onClick={() => setPdf(null)} sx={{ minWidth: 44, minHeight: 44 }}>
            <CloseIcon />
          </IconButton>
        </Stack>
        {pdf?.url && (
          <Box sx={{ height: fullScreen ? 'calc(100dvh - 56px)' : '75vh' }}>
            <object data={pdf.url} type="application/pdf" width="100%" height="100%">
              <iframe src={pdf.url} title={pdf.name} style={{ width: '100%', height: '100%', border: 'none' }} />
            </object>
          </Box>
        )}
      </Dialog>
    </>
  );
}
