'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Divider,
  CircularProgress,
  FormControlLabel,
  Switch,
  RadioGroup,
  Radio,
  FormLabel,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import MicIcon from '@mui/icons-material/Mic';
import PhotoIcon from '@mui/icons-material/Photo';

type SocialProofType = 'video' | 'audio' | 'screenshot';

interface FormData {
  type: SocialProofType;
  speaker_name: string;
  student_name: string;
  batch: string;
  language: string;
  description_en: string;
  description_ta: string;
  youtube_url: string;
  audio_url: string;
  image_url: string;
  parent_photo_url: string;
  caption: string;
  duration_seconds: string;
  display_order: string;
  is_featured: boolean;
  is_homepage: boolean;
  is_active: boolean;
}

const defaultFormData: FormData = {
  type: 'video',
  speaker_name: '',
  student_name: '',
  batch: '',
  language: 'tamil',
  description_en: '',
  description_ta: '',
  youtube_url: '',
  audio_url: '',
  image_url: '',
  parent_photo_url: '',
  caption: '',
  duration_seconds: '',
  display_order: '0',
  is_featured: false,
  is_homepage: false,
  is_active: true,
};

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

export default function CreateSocialProofPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState<FormData>(defaultFormData);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingParentPhoto, setUploadingParentPhoto] = useState(false);

  const handleChange = (field: keyof FormData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleFileUpload = async (
    file: File,
    type: 'audio' | 'image',
    setUploading: (v: boolean) => void,
    targetField: keyof FormData
  ) => {
    try {
      setUploading(true);
      setError(null);

      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', type);

      const res = await fetch('/api/social-proofs/upload', {
        method: 'POST',
        body: fd,
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Upload failed');
      }

      handleChange(targetField, json.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!formData.speaker_name.trim()) {
      setError('Speaker name is required');
      return;
    }

    if (formData.type === 'video' && !formData.youtube_url.trim()) {
      setError('YouTube URL is required for video type');
      return;
    }

    if (formData.type === 'audio' && !formData.audio_url) {
      setError('Audio file is required for audio type');
      return;
    }

    if (formData.type === 'screenshot' && !formData.image_url) {
      setError('Image file is required for screenshot type');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const description: Record<string, string> = {};
      if (formData.description_en.trim()) {
        description.en = formData.description_en.trim();
      }
      if (formData.description_ta.trim()) {
        description.ta = formData.description_ta.trim();
      }

      const youtubeId = formData.type === 'video' ? extractYouTubeId(formData.youtube_url) : null;

      const payload: Record<string, unknown> = {
        type: formData.type,
        speaker_name: formData.speaker_name.trim(),
        student_name: formData.student_name.trim() || null,
        batch: formData.batch.trim() || null,
        language: formData.language,
        description: Object.keys(description).length > 0 ? description : null,
        display_order: Number(formData.display_order) || 0,
        is_featured: formData.is_featured,
        is_homepage: formData.is_homepage,
        is_active: formData.is_active,
      };

      if (formData.type === 'video') {
        payload.youtube_url = formData.youtube_url.trim();
        payload.thumbnail_url = youtubeId
          ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
          : null;
      }

      if (formData.type === 'audio') {
        payload.audio_url = formData.audio_url;
        payload.parent_photo_url = formData.parent_photo_url || null;
        payload.duration_seconds = formData.duration_seconds
          ? Number(formData.duration_seconds)
          : null;
      }

      if (formData.type === 'screenshot') {
        payload.image_url = formData.image_url;
        payload.caption = formData.caption.trim() || null;
      }

      const res = await fetch('/api/social-proofs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to create social proof');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/social-proofs');
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const youtubeId = extractYouTubeId(formData.youtube_url);

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => router.back()}>
          Back
        </Button>
        <Box>
          <Typography variant="h4" component="h1" fontWeight="bold">
            Add Social Proof
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Create a new social proof entry
          </Typography>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Social proof created successfully! Redirecting...
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <Grid container spacing={2}>
          {/* Left Column - Main Form */}
          <Grid item xs={12} md={8}>
            {/* Type Selector */}
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Type
                </Typography>
                <FormControl component="fieldset">
                  <RadioGroup
                    row
                    value={formData.type}
                    onChange={(e) => handleChange('type', e.target.value)}
                  >
                    <FormControlLabel
                      value="video"
                      control={<Radio />}
                      label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <PlayCircleIcon fontSize="small" color="error" />
                          Video
                        </Box>
                      }
                    />
                    <FormControlLabel
                      value="audio"
                      control={<Radio />}
                      label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <MicIcon fontSize="small" color="secondary" />
                          Audio
                        </Box>
                      }
                    />
                    <FormControlLabel
                      value="screenshot"
                      control={<Radio />}
                      label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <PhotoIcon fontSize="small" color="success" />
                          Screenshot
                        </Box>
                      }
                    />
                  </RadioGroup>
                </FormControl>
              </CardContent>
            </Card>

            {/* Type-Specific Fields */}
            <Card sx={{ mb: 2 }}>
              <CardContent>
                {formData.type === 'video' && (
                  <>
                    <Typography variant="h6" gutterBottom>
                      Video Details
                    </Typography>
                    <TextField
                      fullWidth
                      label="YouTube URL"
                      value={formData.youtube_url}
                      onChange={(e) => handleChange('youtube_url', e.target.value)}
                      required
                      placeholder="https://www.youtube.com/watch?v=..."
                      helperText="Paste a YouTube video URL"
                      sx={{ mb: 2 }}
                    />
                    {youtubeId && (
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                          Thumbnail Preview:
                        </Typography>
                        <Box
                          component="img"
                          src={`https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`}
                          alt="YouTube thumbnail"
                          sx={{
                            width: '100%',
                            maxWidth: 480,
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: 'divider',
                          }}
                        />
                      </Box>
                    )}
                  </>
                )}

                {formData.type === 'audio' && (
                  <>
                    <Typography variant="h6" gutterBottom>
                      Audio Details
                    </Typography>

                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        Audio File
                      </Typography>
                      <Button
                        variant="outlined"
                        component="label"
                        startIcon={uploadingAudio ? <CircularProgress size={16} /> : <CloudUploadIcon />}
                        disabled={uploadingAudio}
                      >
                        {uploadingAudio ? 'Uploading...' : formData.audio_url ? 'Replace Audio' : 'Upload Audio'}
                        <input
                          type="file"
                          hidden
                          accept="audio/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(file, 'audio', setUploadingAudio, 'audio_url');
                          }}
                        />
                      </Button>
                      {formData.audio_url && (
                        <Box sx={{ mt: 1 }}>
                          <audio controls src={formData.audio_url} style={{ width: '100%', maxWidth: 480 }} />
                        </Box>
                      )}
                    </Box>

                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        Parent Photo (Optional)
                      </Typography>
                      <Button
                        variant="outlined"
                        component="label"
                        startIcon={uploadingParentPhoto ? <CircularProgress size={16} /> : <CloudUploadIcon />}
                        disabled={uploadingParentPhoto}
                      >
                        {uploadingParentPhoto ? 'Uploading...' : formData.parent_photo_url ? 'Replace Photo' : 'Upload Photo'}
                        <input
                          type="file"
                          hidden
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(file, 'image', setUploadingParentPhoto, 'parent_photo_url');
                          }}
                        />
                      </Button>
                      {formData.parent_photo_url && (
                        <Box sx={{ mt: 1 }}>
                          <Box
                            component="img"
                            src={formData.parent_photo_url}
                            alt="Parent photo"
                            sx={{
                              width: 120,
                              height: 120,
                              borderRadius: 1,
                              objectFit: 'cover',
                              border: '1px solid',
                              borderColor: 'divider',
                            }}
                          />
                        </Box>
                      )}
                    </Box>

                    <TextField
                      fullWidth
                      label="Duration (seconds)"
                      type="number"
                      value={formData.duration_seconds}
                      onChange={(e) => handleChange('duration_seconds', e.target.value)}
                      placeholder="e.g., 120"
                      helperText="Audio duration in seconds"
                      inputProps={{ min: 0 }}
                    />
                  </>
                )}

                {formData.type === 'screenshot' && (
                  <>
                    <Typography variant="h6" gutterBottom>
                      Screenshot Details
                    </Typography>

                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        Screenshot Image
                      </Typography>
                      <Button
                        variant="outlined"
                        component="label"
                        startIcon={uploadingImage ? <CircularProgress size={16} /> : <CloudUploadIcon />}
                        disabled={uploadingImage}
                      >
                        {uploadingImage ? 'Uploading...' : formData.image_url ? 'Replace Image' : 'Upload Image'}
                        <input
                          type="file"
                          hidden
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(file, 'image', setUploadingImage, 'image_url');
                          }}
                        />
                      </Button>
                      {formData.image_url && (
                        <Box sx={{ mt: 1 }}>
                          <Box
                            component="img"
                            src={formData.image_url}
                            alt="Screenshot"
                            sx={{
                              width: '100%',
                              maxWidth: 480,
                              borderRadius: 1,
                              border: '1px solid',
                              borderColor: 'divider',
                            }}
                          />
                        </Box>
                      )}
                    </Box>

                    <TextField
                      fullWidth
                      label="Caption"
                      value={formData.caption}
                      onChange={(e) => handleChange('caption', e.target.value)}
                      placeholder="Short caption for the screenshot"
                      helperText="Optional caption text"
                    />
                  </>
                )}
              </CardContent>
            </Card>

            {/* Common Fields */}
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Speaker & Student Info
                </Typography>

                <TextField
                  fullWidth
                  label="Speaker Name"
                  value={formData.speaker_name}
                  onChange={(e) => handleChange('speaker_name', e.target.value)}
                  required
                  placeholder="e.g., Parent / Student name"
                  sx={{ mb: 2 }}
                />

                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Student Name (Optional)"
                      value={formData.student_name}
                      onChange={(e) => handleChange('student_name', e.target.value)}
                      placeholder="e.g., Rahul Kumar"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Batch (Optional)"
                      value={formData.batch}
                      onChange={(e) => handleChange('batch', e.target.value)}
                      placeholder="e.g., 2025-26"
                    />
                  </Grid>
                </Grid>

                <Divider sx={{ my: 3 }} />

                <Typography variant="h6" gutterBottom>
                  Language & Description
                </Typography>

                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Language</InputLabel>
                  <Select
                    value={formData.language}
                    label="Language"
                    onChange={(e) => handleChange('language', e.target.value)}
                  >
                    <MenuItem value="tamil">Tamil</MenuItem>
                    <MenuItem value="english">English</MenuItem>
                    <MenuItem value="hindi">Hindi</MenuItem>
                    <MenuItem value="kannada">Kannada</MenuItem>
                    <MenuItem value="malayalam">Malayalam</MenuItem>
                    <MenuItem value="telugu">Telugu</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  fullWidth
                  label="Description (English)"
                  value={formData.description_en}
                  onChange={(e) => handleChange('description_en', e.target.value)}
                  multiline
                  rows={3}
                  placeholder="Brief description in English..."
                  sx={{ mb: 2 }}
                />

                <TextField
                  fullWidth
                  label="Description (Tamil) - Optional"
                  value={formData.description_ta}
                  onChange={(e) => handleChange('description_ta', e.target.value)}
                  multiline
                  rows={3}
                  placeholder="Brief description in Tamil (optional)..."
                />
              </CardContent>
            </Card>
          </Grid>

          {/* Right Column - Settings */}
          <Grid item xs={12} md={4}>
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Display Settings
                </Typography>

                <TextField
                  fullWidth
                  label="Display Order"
                  type="number"
                  value={formData.display_order}
                  onChange={(e) => handleChange('display_order', e.target.value)}
                  helperText="Lower number = shown first"
                  size="small"
                  inputProps={{ min: 0 }}
                  sx={{ mb: 2 }}
                />

                <Divider sx={{ my: 2 }} />

                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.is_featured}
                      onChange={(e) => handleChange('is_featured', e.target.checked)}
                    />
                  }
                  label="Featured"
                />
                <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 6, mb: 1.5, mt: -0.5 }}>
                  Show in featured social proofs section
                </Typography>

                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.is_homepage}
                      onChange={(e) => handleChange('is_homepage', e.target.checked)}
                    />
                  }
                  label="Show on Homepage"
                />
                <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 6, mb: 1.5, mt: -0.5 }}>
                  Display on the marketing homepage
                </Typography>

                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.is_active}
                      onChange={(e) => handleChange('is_active', e.target.checked)}
                    />
                  }
                  label="Active"
                />
                <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 6, mt: -0.5 }}>
                  Only active social proofs are publicly visible
                </Typography>
              </CardContent>
            </Card>

            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading || success}
              sx={{ minHeight: 48 }}
            >
              {loading ? <CircularProgress size={24} /> : 'Create Social Proof'}
            </Button>
          </Grid>
        </Grid>
      </form>
    </Box>
  );
}
