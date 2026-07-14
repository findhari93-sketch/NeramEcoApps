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
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import SmartDisplayOutlinedIcon from '@mui/icons-material/SmartDisplayOutlined';
import PDFReader from '@/components/reader/PDFReader';
import ProtectedContent from '@/components/ProtectedContent';
import StudyCommentPanel from '@/components/study-materials/StudyCommentPanel';
import StudyTestDialog from '@/components/study-materials/StudyTestDialog';
import RecordingPlayerDialog from '@/components/course-plan/RecordingPlayerDialog';
import { useStudyTimeTracker } from '@/hooks/useStudyTimeTracker';
import type { NexusStudyFileDTO } from '@neram/database/types';

interface StudyFileViewerProps {
  file: NexusStudyFileDTO | null;
  token: string | null;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  /**
   * When set (student viewers), a faint diagonal watermark of the student's identity is drawn over
   * PDF pages and images. Leave undefined for trusted viewers (teacher preview).
   */
  watermark?: string;
  /** Silently record the student's reading time on this file while the viewer is open. */
  track?: boolean;
  /** Called after the student passes the test (so the caller can refresh the file's status). */
  onProgressChange?: () => void;
}

/** A tiled, low-opacity diagonal watermark background (for images; PDFs bake it onto the canvas). */
function watermarkBackground(text: string): string {
  const safe = text.replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string)
  );
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='200'>` +
    `<text x='150' y='100' font-family='sans-serif' font-size='15' font-weight='600' ` +
    `fill='rgba(107,114,128,0.13)' text-anchor='middle' transform='rotate(-30 150 100)'>${safe}</text>` +
    `</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

function Glyph({ kind, size = 22 }: { kind: string; size?: number }) {
  if (kind === 'pdf') return <PictureAsPdfOutlinedIcon sx={{ fontSize: size, color: '#d32f2f' }} />;
  if (kind === 'image') return <ImageOutlinedIcon sx={{ fontSize: size, color: '#1976d2' }} />;
  return <InsertDriveFileOutlinedIcon sx={{ fontSize: size, color: 'text.secondary' }} />;
}

export default function StudyFileViewer({ file, token, getToken, onClose, watermark, track, onProgressChange }: StudyFileViewerProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [tab, setTab] = useState<'doc' | 'comments'>('doc');
  const [testOpen, setTestOpen] = useState(false);
  const [watchOpen, setWatchOpen] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);

  const watchClass = () => {
    const rec = file?.recording;
    if (!rec) return;
    if (rec.source === 'youtube' && rec.youtube_id) setWatchOpen(true);
    else if (rec.url) window.open(rec.url, '_blank', 'noopener');
  };

  // Reset to the document tab whenever a new file opens.
  useEffect(() => { if (file) { setTab('doc'); setJustCompleted(false); } }, [file]);

  // Silently accrue reading time for the student while this file is open.
  useStudyTimeTracker({ fileId: track && file ? file.id : null, token, enabled: !!track });

  const completed = !!file && (file.status === 'completed' || justCompleted);

  const contentUrl = (download = false) =>
    file
      ? `/api/study-materials/files/${file.id}/content?token=${encodeURIComponent(token || '')}${download ? '&download=1' : ''}`
      : '';

  return (
    <>
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
                {/* ProtectedContent blocks right-click, text selection, Ctrl+S/P and printing while viewing. */}
                <ProtectedContent disableScreenshot sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', width: '100%' }}>
                  {file.kind === 'pdf' ? (
                    <PDFReader pdfUrl={contentUrl()} watermark={watermark} />
                  ) : (
                    <Box
                      onContextMenu={(e) => e.preventDefault()}
                      sx={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={contentUrl()}
                        alt={file.title}
                        draggable={false}
                        onContextMenu={(e) => e.preventDefault()}
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', userSelect: 'none', pointerEvents: 'none' }}
                      />
                      {watermark && (
                        <Box
                          aria-hidden
                          sx={{
                            position: 'absolute',
                            inset: 0,
                            pointerEvents: 'none',
                            backgroundImage: watermarkBackground(watermark),
                            backgroundRepeat: 'repeat',
                          }}
                        />
                      )}
                    </Box>
                  )}
                </ProtectedContent>
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

          {/* Student "next step" footer: study the PDF, optionally watch the class, then pass the test. */}
          {track && (
            <Box sx={{ flexShrink: 0, borderTop: `1px solid ${theme.palette.divider}`, px: 2, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', bgcolor: 'background.paper' }}>
              {file.recording && (
                <Button variant="outlined" size="small" startIcon={<SmartDisplayOutlinedIcon />} onClick={watchClass} sx={{ textTransform: 'none', flexShrink: 0 }}>
                  Watch class
                </Button>
              )}
              {completed ? (
                <>
                  <CheckCircleIcon sx={{ color: 'success.main' }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={700} color="success.main">Chapter completed</Typography>
                    {file.best_score_pct != null && (
                      <Typography variant="caption" color="text.secondary">Best score {Math.round(file.best_score_pct)}%</Typography>
                    )}
                  </Box>
                  {file.has_test && (
                    <Button size="small" variant="text" onClick={() => setTestOpen(true)} sx={{ textTransform: 'none', flexShrink: 0 }}>Retake</Button>
                  )}
                </>
              ) : file.has_test ? (
                <>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={700}>Ready to complete this chapter?</Typography>
                    <Typography variant="caption" color="text.secondary">Pass the short test to mark it completed.</Typography>
                  </Box>
                  <Button variant="contained" startIcon={<QuizOutlinedIcon />} onClick={() => setTestOpen(true)} sx={{ textTransform: 'none', flexShrink: 0 }}>Take test</Button>
                </>
              ) : (
                <>
                  <HourglassEmptyIcon sx={{ color: 'text.disabled' }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} color="text.secondary">Test coming soon</Typography>
                    <Typography variant="caption" color="text.secondary">A test will be added so you can complete this chapter.</Typography>
                  </Box>
                </>
              )}
            </Box>
          )}
        </Box>
      )}
    </Dialog>

    <StudyTestDialog
      open={testOpen}
      file={file ? { id: file.id, title: file.title } : null}
      getToken={getToken}
      onClose={() => setTestOpen(false)}
      onCompleted={() => { setJustCompleted(true); onProgressChange?.(); }}
    />

    {file?.recording?.youtube_id && (
      <RecordingPlayerDialog
        open={watchOpen}
        onClose={() => setWatchOpen(false)}
        youtubeId={file.recording.youtube_id}
        title={`${file.title} - class recording`}
      />
    )}
    </>
  );
}
