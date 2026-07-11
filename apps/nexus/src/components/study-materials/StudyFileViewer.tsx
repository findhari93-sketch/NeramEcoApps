'use client';

/**
 * StudyFileViewer — the view-only file viewer with a Google Classroom style comments panel.
 * PDFs render in the in-app PDFReader (download/print toolbar hidden); images render as a contained
 * <img>. Desktop shows document + comments side by side; mobile uses a Document / Comments toggle.
 * Shared by the Study Materials browser and the Starred view.
 */

import { useState, useEffect } from 'react';
import {
  Box, Typography, IconButton, Button, ToggleButton, ToggleButtonGroup, Dialog,
  alpha, useTheme, useMediaQuery,
} from '@neram/ui';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import CloseIcon from '@mui/icons-material/Close';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import PDFReader from '@/components/reader/PDFReader';
import StudyCommentPanel from '@/components/study-materials/StudyCommentPanel';
import type { NexusStudyFileDTO } from '@neram/database/types';

interface StudyFileViewerProps {
  file: NexusStudyFileDTO | null;
  token: string | null;
  getToken: () => Promise<string | null>;
  onClose: () => void;
}

function Glyph({ kind, size = 22 }: { kind: string; size?: number }) {
  if (kind === 'pdf') return <PictureAsPdfOutlinedIcon sx={{ fontSize: size, color: '#d32f2f' }} />;
  if (kind === 'image') return <ImageOutlinedIcon sx={{ fontSize: size, color: '#1976d2' }} />;
  return <InsertDriveFileOutlinedIcon sx={{ fontSize: size, color: 'text.secondary' }} />;
}

export default function StudyFileViewer({ file, token, getToken, onClose }: StudyFileViewerProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [tab, setTab] = useState<'doc' | 'comments'>('doc');

  // Reset to the document tab whenever a new file opens.
  useEffect(() => { if (file) setTab('doc'); }, [file]);

  const contentUrl = (download = false) =>
    file
      ? `/api/study-materials/files/${file.id}/content?token=${encodeURIComponent(token || '')}${download ? '&download=1' : ''}`
      : '';

  return (
    <Dialog
      open={!!file}
      onClose={onClose}
      fullScreen={isMobile}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { height: isMobile ? '100%' : '92vh', borderRadius: isMobile ? 0 : 2 } }}
    >
      {file && (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.25, borderBottom: `1px solid ${theme.palette.divider}`, flexShrink: 0 }}>
            <Glyph kind={file.kind} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>{file.title}</Typography>
            {file.downloadable && (
              <Button size="small" startIcon={<DownloadOutlinedIcon />} onClick={() => window.open(contentUrl(true), '_blank')}>
                Download
              </Button>
            )}
            <IconButton size="small" onClick={onClose} aria-label="Close" sx={{ width: 40, height: 40 }}>
              <CloseIcon />
            </IconButton>
          </Box>

          {/* Mobile: Document / Comments toggle */}
          {isMobile && (
            <ToggleButtonGroup
              value={tab}
              exclusive
              onChange={(_, v) => v && setTab(v)}
              fullWidth
              size="small"
              sx={{ p: 1, flexShrink: 0, '& .MuiToggleButton-root': { minHeight: 40, textTransform: 'none', gap: 0.5 } }}
            >
              <ToggleButton value="doc">
                {file.kind === 'pdf' ? <PictureAsPdfOutlinedIcon fontSize="small" /> : <ImageOutlinedIcon fontSize="small" />}
                Document
              </ToggleButton>
              <ToggleButton value="comments">
                <ChatBubbleOutlineIcon fontSize="small" /> Comments
              </ToggleButton>
            </ToggleButtonGroup>
          )}

          {/* Body */}
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
            {(!isMobile || tab === 'doc') && (
              <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', bgcolor: alpha(theme.palette.text.primary, 0.03) }}>
                {file.kind === 'pdf' ? (
                  <PDFReader pdfUrl={contentUrl()} />
                ) : (
                  <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={contentUrl()} alt={file.title} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  </Box>
                )}
              </Box>
            )}

            {(!isMobile || tab === 'comments') && (
              <Box
                sx={{
                  width: isMobile ? '100%' : 360,
                  flexShrink: 0,
                  minHeight: 0,
                  borderLeft: isMobile ? 'none' : `1px solid ${theme.palette.divider}`,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <StudyCommentPanel fileId={file.id} getToken={getToken} />
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Dialog>
  );
}
