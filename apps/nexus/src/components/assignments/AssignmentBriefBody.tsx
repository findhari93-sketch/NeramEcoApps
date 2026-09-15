'use client';

/**
 * Everything the teacher gave a student to work from: the class recording, the
 * reference images, the brief itself, an explainer video, links and files.
 *
 * Shared by the document assignment page and the drawing workspace's brief
 * section, so the two cannot drift apart in what they show or how they open it.
 */
import { Box, Button, Stack, Typography } from '@neram/ui';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import LinkIcon from '@mui/icons-material/Link';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import OndemandVideoOutlinedIcon from '@mui/icons-material/OndemandVideoOutlined';
import NeramVideoPlayer from '@/components/video/NeramVideoPlayer';
import { OPEN_GATE } from '@/lib/video-gate';
import { extractYouTubeId } from '@/lib/youtube';
import AssignmentBrief from './AssignmentBrief';
import type { AssignmentRecording, StudentAssignmentDetail } from './workspace/types';

/** The multi-image set, falling back to the single legacy content image. */
export function referenceImagesOf(detail: Pick<StudentAssignmentDetail, 'reference_images' | 'content_image_url'>): string[] {
  if (detail.reference_images?.length) return detail.reference_images;
  return detail.content_image_url ? [detail.content_image_url] : [];
}

export default function AssignmentBriefBody({
  detail,
  recording,
  onOpenAttachment,
  onOpenImage,
  compactImages = false,
}: {
  detail: StudentAssignmentDetail;
  recording: AssignmentRecording;
  onOpenAttachment: (studyFileId: string) => void;
  /** Defaults to a new tab. */
  onOpenImage?: (src: string) => void;
  /** Square thumbnails even for a single image, for a narrow panel. */
  compactImages?: boolean;
}) {
  const youtubeId = recording.url && recording.source === 'youtube' ? extractYouTubeId(recording.url) : null;
  const refImages = referenceImagesOf(detail);
  const openImage = onOpenImage ?? ((src: string) => window.open(src, '_blank', 'noopener'));
  const squareImages = compactImages || refImages.length > 1;

  return (
    <Stack spacing={2}>
      {recording.url && (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700, mb: recording.class_title ? 0.25 : 1 }}>
            Class recording
          </Typography>
          {/* Which lesson, not just "a recording": the student can tell what
              they are about to watch. */}
          {recording.class_title && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              From {recording.class_title}
            </Typography>
          )}
          {youtubeId ? (
            <Box sx={{ position: 'relative', pt: '56.25%', borderRadius: 2, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ position: 'absolute', inset: 0 }}>
                <NeramVideoPlayer
                  source={{ kind: 'youtube', youtubeId }}
                  gate={OPEN_GATE}
                  title="Class recording"
                  allowFullscreen
                />
              </Box>
            </Box>
          ) : (
            <Button
              variant="outlined"
              fullWidth
              startIcon={<PlayCircleOutlineIcon />}
              endIcon={<OpenInNewIcon sx={{ fontSize: 15 }} />}
              onClick={() => window.open(recording.url!, '_blank', 'noopener')}
              sx={{ minHeight: 48, textTransform: 'none' }}
            >
              Watch the class recording
            </Button>
          )}
        </Box>
      )}

      {refImages.length > 0 && (
        <Box>
          {(refImages.length > 1 || compactImages) && (
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
              {refImages.length > 1 ? `Reference (${refImages.length})` : 'Reference'}
            </Typography>
          )}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: squareImages ? 'repeat(auto-fill, minmax(96px, 1fr))' : '1fr',
              gap: 1,
            }}
          >
            {refImages.map((src, i) => (
              <Box
                key={`${src}-${i}`}
                component="button"
                type="button"
                onClick={() => openImage(src)}
                aria-label={refImages.length > 1 ? `Open reference ${i + 1}` : 'Open the reference image'}
                sx={{
                  p: 0,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  bgcolor: 'grey.50',
                  display: 'block',
                  '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                }}
              >
                <Box
                  component="img"
                  src={src}
                  alt=""
                  loading="lazy"
                  sx={{
                    width: '100%',
                    display: 'block',
                    ...(squareImages ? { aspectRatio: '1 / 1', objectFit: 'cover' } : {}),
                  }}
                />
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* The brief: question cards, marks and maths, not a wall of text. */}
      <AssignmentBrief
        instructions={detail.instructions}
        expectedOutcome={detail.expected_outcome}
        focusPoints={detail.focus_points}
      />

      {(detail.content_video_url || detail.links.length > 0) && (
        <Stack spacing={1}>
          {detail.content_video_url && (
            <Button
              variant="outlined"
              startIcon={<OndemandVideoOutlinedIcon />}
              endIcon={<OpenInNewIcon sx={{ fontSize: 15 }} />}
              onClick={() => window.open(detail.content_video_url!, '_blank', 'noopener')}
              sx={{ justifyContent: 'flex-start', minHeight: 48, textTransform: 'none' }}
            >
              Watch explainer video
            </Button>
          )}
          {detail.links.map((l, i) => (
            <Button
              key={i}
              variant="outlined"
              startIcon={<LinkIcon />}
              endIcon={<OpenInNewIcon sx={{ fontSize: 15 }} />}
              onClick={() => window.open(l.url, '_blank', 'noopener')}
              sx={{ justifyContent: 'flex-start', minHeight: 48, textTransform: 'none' }}
            >
              <Box sx={{ flex: 1, textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.label}</Box>
            </Button>
          ))}
        </Stack>
      )}

      {detail.attachments.length > 0 && (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
            Reference materials
          </Typography>
          <Stack spacing={1}>
            {detail.attachments.map((a) => {
              const isPdf = a.file?.file_type === 'application/pdf';
              return (
                <Button
                  key={a.id}
                  variant="outlined"
                  onClick={() => onOpenAttachment(a.study_file_id)}
                  startIcon={isPdf ? <PictureAsPdfOutlinedIcon /> : <ImageOutlinedIcon />}
                  endIcon={<OpenInNewIcon sx={{ fontSize: 15 }} />}
                  sx={{ justifyContent: 'flex-start', minHeight: 48, textTransform: 'none' }}
                >
                  <Box sx={{ flex: 1, textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {a.file?.title || a.file?.file_name || 'File'}
                  </Box>
                </Button>
              );
            })}
          </Stack>
        </Box>
      )}
    </Stack>
  );
}
