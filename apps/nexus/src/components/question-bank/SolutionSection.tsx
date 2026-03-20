'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Dialog,
  IconButton,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { NexusQBQuestionDetail } from '@neram/database';
import MathText from '@/components/common/MathText';

interface SolutionSectionProps {
  question: NexusQBQuestionDetail;
  defaultExpanded?: boolean;
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function isSharePointUrl(url: string): boolean {
  return /\.sharepoint\.com\//i.test(url) || /onedrive\.live\.com\//i.test(url);
}

function getSharePointEmbedUrl(url: string): string {
  if (/onedrive\.live\.com\//i.test(url)) {
    return url.replace(/\/redir\?/i, '/embed?').replace(/\/view\?/i, '/embed?');
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (parsed.pathname.includes('_layouts/15/embed.aspx')) return url;
    if (parsed.pathname.includes('download.aspx') || parsed.pathname.includes('_api')) {
      const srcParam = parsed.searchParams.get('UniqueId') || parsed.searchParams.get('sourcedoc');
      if (srcParam) {
        return `https://${host}/_layouts/15/embed.aspx?UniqueId=${encodeURIComponent(srcParam)}`;
      }
    }
    return `https://${host}/_layouts/15/embed.aspx?url=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}

export default function SolutionSection({
  question,
  defaultExpanded = false,
}: SolutionSectionProps) {
  const [imageZoomed, setImageZoomed] = useState(false);

  const videoId = question.solution_video_url
    ? extractYouTubeId(question.solution_video_url)
    : null;

  return (
    <Box>
      {/* Brief explanation - always visible */}
      {question.explanation_brief && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, color: 'text.secondary' }}>
            Quick Explanation
          </Typography>
          <MathText text={question.explanation_brief} variant="body2" sx={{ lineHeight: 1.7, color: 'text.primary' }} />
        </Box>
      )}

      {/* Detailed solution - accordion */}
      {(question.explanation_detailed || videoId || question.solution_video_url || question.solution_image_url) && (
        <Accordion
          defaultExpanded={defaultExpanded}
          sx={{
            '&:before': { display: 'none' },
            boxShadow: 'none',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '8px !important',
            overflow: 'hidden',
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{ minHeight: 48, '& .MuiAccordionSummary-content': { my: 1 } }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Detailed Solution
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            {/* Detailed text */}
            {question.explanation_detailed && (
              <MathText
                text={question.explanation_detailed}
                variant="body2"
                sx={{ lineHeight: 1.7, mb: 2 }}
              />
            )}

            {/* Video embed: YouTube, SharePoint/OneDrive, or fallback link */}
            {videoId ? (
              <Box
                sx={{
                  position: 'relative',
                  width: '100%',
                  paddingTop: '56.25%',
                  mb: 2,
                  borderRadius: 1,
                  overflow: 'hidden',
                  bgcolor: 'grey.900',
                }}
              >
                <Box
                  component="iframe"
                  src={`https://www.youtube-nocookie.com/embed/${videoId}`}
                  title="Solution video"
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    border: 0,
                  }}
                />
              </Box>
            ) : question.solution_video_url && isSharePointUrl(question.solution_video_url) ? (
              <Box
                sx={{
                  position: 'relative',
                  width: '100%',
                  paddingTop: '56.25%',
                  mb: 2,
                  borderRadius: 1,
                  overflow: 'hidden',
                  bgcolor: 'grey.900',
                }}
              >
                <Box
                  component="iframe"
                  src={getSharePointEmbedUrl(question.solution_video_url)}
                  title="Solution video"
                  loading="lazy"
                  allowFullScreen
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    border: 0,
                  }}
                />
              </Box>
            ) : question.solution_video_url ? (
              <Box sx={{ mb: 2 }}>
                <Box
                  component="a"
                  href={question.solution_video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    color: 'primary.main',
                    textDecoration: 'none',
                    '&:hover': { textDecoration: 'underline' },
                  }}
                >
                  <OpenInNewIcon fontSize="small" />
                  <Typography variant="body2">Open solution video</Typography>
                </Box>
              </Box>
            ) : null}

            {/* Solution image (zoomable) */}
            {question.solution_image_url && (
              <>
                <Box
                  component="img"
                  src={question.solution_image_url}
                  alt="Solution diagram"
                  onClick={() => setImageZoomed(true)}
                  sx={{
                    maxWidth: '100%',
                    borderRadius: 1,
                    cursor: 'zoom-in',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                />
                <Dialog
                  open={imageZoomed}
                  onClose={() => setImageZoomed(false)}
                  maxWidth="lg"
                  fullWidth
                >
                  <Box sx={{ position: 'relative' }}>
                    <IconButton
                      onClick={() => setImageZoomed(false)}
                      sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
                      aria-label="Close zoomed image"
                    >
                      <CloseIcon />
                    </IconButton>
                    <Box
                      component="img"
                      src={question.solution_image_url}
                      alt="Solution diagram (zoomed)"
                      sx={{ width: '100%', display: 'block' }}
                    />
                  </Box>
                </Dialog>
              </>
            )}
          </AccordionDetails>
        </Accordion>
      )}
    </Box>
  );
}
