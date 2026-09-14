'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box, Button, Typography, TextField, Paper, IconButton,
  LinearProgress, Drawer, alpha, useMediaQuery,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined';
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined';
import RotateLeftIcon from '@mui/icons-material/RotateLeft';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import ClipboardPasteZone from './ClipboardPasteZone';
import VoiceNotePlayer, { type VoiceProgressReport } from './voice/VoiceNotePlayer';
import { compressImage } from '@/utils/imageCompression';
import { measureImageQuality } from '@/lib/measure-image-quality';
import { nextRotation, prevRotation, rotationTransform, type Rotation } from '@/lib/image-rotation';
import { useCanCapturePhoto } from '@/hooks/useCanCapturePhoto';
import type { VoiceFeedbackView } from '@/lib/drawing-voice-feedback';

interface DrawingSubmissionSheetProps {
  open: boolean;
  onClose: () => void;
  questionId?: string;
  /** Set when submitting against a drawing-type class assignment. */
  assignmentId?: string;
  sourceType: 'question_bank' | 'free_practice' | 'assignment' | 'sketchbook';
  /** When resubmitting after a redo, the teacher's ask, shown up top. */
  redoFeedback?: string | null;
  /** Teacher's corrected reference from the last review, shown as a reminder. */
  referenceImageUrl?: string | null;
  /** The teacher's voice note about the redo, so the student can replay it while redrawing. */
  redoVoice?: VoiceFeedbackView | null;
  /** Receipt callback for that note, so listening here counts toward "Heard". */
  onRedoVoiceProgress?: (report: VoiceProgressReport) => void;
  getToken: () => Promise<string | null>;
  onSubmitted: () => void;
  /**
   * Where the submission record is created, once the image is uploaded.
   *
   * Defaults to the drawing module's own route. The Question Bank passes its
   * own, because a bank drawing has to mint its practice-module mirror before
   * the submission can carry a thread, and that is not the drawing module's
   * business. Upload is unchanged either way: one bucket, one route.
   */
  submitUrl?: string;
  /** The body for `submitUrl`. Required when submitUrl is set. */
  submitBody?: (uploadedUrl: string, selfNote: string | null, thumbnailUrl: string | null) => unknown;
  /**
   * Also upload a 400px JPEG and pass its URL as the third submitBody
   * argument. Grids that show many sketches load only the thumbnail.
   */
  withThumbnail?: boolean;
  /** Copy overrides. The drawing module keeps its defaults. */
  title?: string;
  noteLabel?: string;
  notePlaceholder?: string;
  noteMaxLength?: number;
  submitLabel?: string;
}

export default function DrawingSubmissionSheet({
  open, onClose, questionId, assignmentId, sourceType, redoFeedback, referenceImageUrl,
  redoVoice, onRedoVoiceProgress, getToken, onSubmitted,
  submitUrl, submitBody, withThumbnail = false, title, noteLabel = 'Self-reflection note (optional)',
  notePlaceholder = 'e.g., I struggled with the shadow direction...', noteMaxLength, submitLabel,
}: DrawingSubmissionSheetProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const canCapture = useCanCapturePhoto();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selfNote, setSelfNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  // Phone cameras hand us sideways photos often enough that fixing it here,
  // before submitting, saves the teacher from doing it during review.
  const [rotation, setRotation] = useState<Rotation>(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [fitBox, setFitBox] = useState({ rw: 0, rh: 0, cw: 0, ch: 0 });
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const measureFit = useCallback(() => {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img) return;
    setFitBox({
      rw: img.offsetWidth,
      rh: img.offsetHeight,
      cw: stage.clientWidth,
      ch: stage.clientHeight,
    });
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !preview) return;
    measureFit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measureFit);
    observer.observe(stage);
    if (imgRef.current) observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, [measureFit, preview]);

  const clearSelection = () => {
    setFile(null);
    setPreview(null);
    setRotation(0);
  };

  const handleFile = (f: File) => {
    if (!f.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('Image must be under 10MB');
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setRotation(0);
    setError('');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) handleFile(selected);
  };

  const uploadOne = async (token: string, blob: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', blob);
    formData.append('bucket', 'drawing-uploads');
    const res = await fetch('/api/drawing/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      if (res.status === 413) throw new Error('That image is too large to upload. Please try a smaller photo.');
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Upload failed. Please check your connection and try again.');
    }
    const { url } = await res.json();
    return url as string;
  };

  const handleSubmit = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(10);

    try {
      const token = await getToken();
      if (!token) {
        setError('Session expired. Please refresh the page and try again.');
        setUploading(false);
        return;
      }

      // Phone photos are routinely 5-9MB, which clears the client cap but
      // exceeds Vercel's 4.5MB serverless body limit and gets rejected before
      // the upload route runs. Downscale + re-encode to JPEG first so the body
      // stays well under that limit (also much faster on mobile networks).
      let toUpload: File;
      try {
        toUpload = await compressImage(file, 2400, 0.85, 'drawing.jpg', rotation);
      } catch {
        // The raw file is a fine fallback when the browser cannot decode the
        // image, but only while it is already the right way up. Once a rotation
        // has been asked for, uploading the untouched original would silently
        // discard it and send the sideways photo anyway, so stop and say so.
        if (rotation !== 0) {
          setError('Could not rotate this image on your device. Try retaking the photo the right way up.');
          setUploading(false);
          setProgress(0);
          return;
        }
        toUpload = file;
      }
      setProgress(30);

      // Measured from the exact pixels being uploaded, while they are still on
      // the device, so the teacher's triage knows a blank or unreadable photo
      // before anyone opens it. Never blocks: a failed measure is just unknown.
      const qualityPromise = measureImageQuality(toUpload);

      const url = await uploadOne(token, toUpload);
      setProgress(withThumbnail ? 45 : 60);

      let thumbnailUrl: string | null = null;
      if (withThumbnail) {
        try {
          const thumb = await compressImage(toUpload, 400, 0.8, 'thumb.jpg', 0);
          thumbnailUrl = await uploadOne(token, thumb);
        } catch {
          // A missing thumbnail costs bandwidth in the grid, not the sketch. Never block on it.
          thumbnailUrl = null;
        }
        setProgress(60);
      }

      const imageQuality = await qualityPromise;

      const submitRes = await fetch(submitUrl || '/api/drawing/submissions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          submitUrl && submitBody
            ? submitBody(url, selfNote || null, thumbnailUrl)
            : {
                question_id: questionId || null,
                assignment_id: assignmentId || null,
                source_type: sourceType,
                original_image_url: url,
                self_note: selfNote || null,
                image_quality: imageQuality,
              },
        ),
      });

      if (!submitRes.ok) {
        const errData = await submitRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Submission failed');
      }
      setProgress(100);

      // Start the AI draft (turn the photo upright, score it, tag it) so it is
      // ready before a teacher opens the sheet. Fired and forgotten: keepalive
      // lets it outlive this sheet closing, and the student never waits on it
      // or hears about a failure. Sketchbook pages are never reviewed, so they
      // are never drafted.
      if (sourceType !== 'sketchbook') {
        const created = await submitRes.json().catch(() => null);
        const submissionId: unknown = created?.submission?.id ?? created?.data?.submissionId;
        if (typeof submissionId === 'string' && submissionId) {
          fetch(`/api/drawing/submissions/${submissionId}/auto-draft`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            keepalive: true,
          }).catch(() => {});
        }
      }

      clearSelection();
      setSelfNote('');
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <Drawer anchor="bottom" open={open} onClose={onClose}>
      <Paper sx={{ p: 2, maxHeight: '90vh', overflow: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>
            {title ?? 'Submit Your Drawing'}
          </Typography>
          <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        </Box>

        {(redoFeedback || redoVoice) && (
          <Box
            sx={{
              p: 1.5,
              mb: 2,
              borderRadius: 2,
              bgcolor: alpha('#EF6C00', 0.1),
              border: `1px solid ${alpha('#EF6C00', 0.3)}`,
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700, color: '#B54700' }}>
              Your teacher asked for a redo
            </Typography>
            {redoVoice && (
              <Box sx={{ mt: 1, mb: redoFeedback ? 1 : 0 }}>
                <VoiceNotePlayer
                  url={redoVoice.url}
                  mime={redoVoice.audio_mime}
                  durationMs={redoVoice.duration_ms}
                  title="Listen before you redraw"
                  sketch={redoVoice.sketch}
                  imageUrl={redoVoice.base_image_url}
                  onProgress={onRedoVoiceProgress}
                />
              </Box>
            )}
            {redoFeedback && (
              <Typography variant="body2" sx={{ mt: 0.25, whiteSpace: 'pre-wrap' }}>
                {redoFeedback}
              </Typography>
            )}
            {referenceImageUrl && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                  Reference to aim for
                </Typography>
                <Box
                  component="img"
                  src={referenceImageUrl}
                  alt="Teacher reference"
                  sx={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}
                />
              </Box>
            )}
          </Box>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        {!preview ? (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5 }}>
              {canCapture && (
                <Button
                  variant="outlined"
                  startIcon={<CameraAltOutlinedIcon />}
                  onClick={() => { if (fileRef.current) { fileRef.current.capture = 'environment'; fileRef.current.click(); } }}
                  sx={{ flex: 1, minHeight: 48, textTransform: 'none' }}
                >
                  Camera
                </Button>
              )}
              <Button
                variant="outlined"
                startIcon={<PhotoLibraryOutlinedIcon />}
                onClick={() => { if (fileRef.current) { fileRef.current.removeAttribute('capture'); fileRef.current.click(); } }}
                sx={{ flex: 1, minHeight: 48, textTransform: 'none' }}
              >
                {canCapture ? 'Gallery' : 'Choose image'}
              </Button>
            </Box>
            <ClipboardPasteZone
              onFile={handleFile}
              isUploading={uploading}
              maxSizeMB={10}
            />
          </Box>
        ) : (
          <Box sx={{ mb: 2 }}>
            {/* Fixed-height stage so a quarter turn cannot reflow the sheet */}
            <Box
              ref={stageRef}
              sx={{
                height: 300,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                borderRadius: 1,
                bgcolor: 'grey.50',
              }}
            >
              <Box
                component="img"
                ref={imgRef}
                src={preview}
                alt="Preview of the drawing you are about to submit"
                onLoad={measureFit}
                sx={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  display: 'block',
                  // Rotating alone would overflow the stage, because the box the
                  // image occupies swaps its axes. The paired scale refits it.
                  transform: rotationTransform(fitBox.rw, fitBox.rh, fitBox.cw, fitBox.ch, rotation),
                  transition: prefersReducedMotion ? 'none' : 'transform 0.22s ease',
                }}
              />
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
              <IconButton
                onClick={() => setRotation(prevRotation)}
                disabled={uploading}
                aria-label="Rotate left"
                sx={{ width: 48, height: 48, border: '1px solid', borderColor: 'divider' }}
              >
                <RotateLeftIcon />
              </IconButton>
              <IconButton
                onClick={() => setRotation(nextRotation)}
                disabled={uploading}
                aria-label="Rotate right"
                sx={{ width: 48, height: 48, border: '1px solid', borderColor: 'divider' }}
              >
                <RotateRightIcon />
              </IconButton>
              <Box sx={{ flex: 1 }} />
              <Button size="small" onClick={clearSelection} disabled={uploading} sx={{ minHeight: 48 }}>
                Change image
              </Button>
            </Box>

            {rotation !== 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Your drawing will be saved the way you see it here.
              </Typography>
            )}
          </Box>
        )}

        <TextField
          label={noteLabel}
          placeholder={notePlaceholder}
          multiline
          rows={2}
          fullWidth
          value={selfNote}
          onChange={(e) => setSelfNote(noteMaxLength ? e.target.value.slice(0, noteMaxLength) : e.target.value)}
          inputProps={noteMaxLength ? { maxLength: noteMaxLength } : undefined}
          helperText={noteMaxLength ? `${selfNote.length}/${noteMaxLength}` : undefined}
          sx={{ mb: 2 }}
        />

        {uploading && <LinearProgress variant="determinate" value={progress} sx={{ mb: 1 }} />}
        {error && <Typography color="error" variant="caption" sx={{ mb: 1, display: 'block' }}>{error}</Typography>}

        <Button
          variant="contained"
          fullWidth
          disabled={!file || uploading}
          onClick={handleSubmit}
          sx={{ minHeight: 48, textTransform: 'none' }}
        >
          {uploading ? 'Submitting...' : (submitLabel ?? 'Submit Drawing')}
        </Button>
      </Paper>
    </Drawer>
  );
}
