'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
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
  Chip,
  Skeleton,
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

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'video': return <PlayCircleIcon sx={{ fontSize: 18, mr: 0.5 }} color="error" />;
    case 'audio': return <MicIcon sx={{ fontSize: 18, mr: 0.5 }} color="secondary" />;
    case 'screenshot': return <PhotoIcon sx={{ fontSize: 18, mr: 0.5 }} color="success" />;
    default: return null;
  }
}

function getTypeColor(type: string): 'error' | 'secondary' | 'success' | 'default' {
  switch (type) {
    case 'video': return 'error';
    case 'audio': return 'secondary';
    case 'screenshot': return 'success';
    default: return 'default';
  }
}

export default function EditSocialProofPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingParentPhoto, setUploadingParentPhoto] = useState(false);

  const [formData, setFormData] = useState<FormData>({
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
  });

  // Fetch existing social proof data
  useEffect(() => {
    const fetchSocialProof = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/social-proofs/${id}`);
        const json = await res.json();

        if (res.status === 404) {
          setNotFound(true);
          return;
        }

        if (!res.ok) {
          throw new Error(json.error || 'Failed to fetch social proof');
        }

        const sp = json.data;
        const description = sp.description || {};

        setFormData({
          type: sp.type || 'video',
          speaker_name: sp.speaker_name || '',
          student_name: sp.student_name || '',
          batch: sp.batch || '',
          language: sp.language || 'tamil',
          description_en: description.en || '',
          description_ta: description.ta || '',
          youtube_url: sp.youtube_url || '',
          audio_url: sp.audio_url || '',
          image_url: sp.image_url || '',
          parent_photo_url: sp.parent_photo_url || '',
          caption: sp.caption || '',
          duration_seconds: sp.duration_seconds != null ? String(sp.duration_seconds) : '',
          display_order: sp.display_order != null ? String(sp.display_order) : '0',
          is_featured: sp.is_featured ?? false,
          is_homepage: sp.is_homepage ?? false,
          is_active: sp.is_active ?? true,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchSocialProof();
  }, [id]);

  const handleChange = (field: keyof FormData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
    setSuccess(false);
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
      setSaving(true);
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

      const res = await fetch(`/api/social-proofs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to update social proof');
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  if (notFound) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h5" gutterBottom>
          Social Proof Not Found
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          The social proof you are looking for does not exist or has been removed.
        </Typography>
        <Button
          variant="contained"
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push('/social-proofs')}
        >
          Back to Social Proofs
        </Button>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Skeleton variant="rectangular" width={80} height={36} />
          <Box>
            <Skeleton variant="text" width={250} height={40} />
            <Skeleton variant="text" width={180} height={24} />
          </Box>
        </Box>
        <Grid container spacing={2}>
          <Grid item xs={12} md={8}>
            <Skeleton variant="rectangular" height={500} sx={{ borderRadius: 1 }} />
          </Grid>
          <Grid item xs={12} md={4}>
            <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 1 }} />
          </Grid>
        </Grid>
      </Box>
    );
  }

  const youtubeId = extractYouTubeId(formData.youtube_url);

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => router.push('/social-proofs')}>
          Back
        </Button>
        <Box>
          <Typography variant="h4" component="h1" fontWeight="bold">
            Edit Social Proof
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Update {formData.speaker_name || 'speaker'}&apos;s social proof
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
          Social proof updated successfully!
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <Grid container spacing={2}>
          {/* Left Column - Main Form */}
          <Grid item xs={12} md={8}>
            {/* Type Display (read-only) */}
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Type
                </Typography>
                <Chip
                  icon={getTypeIcon(formData.type) || undefined}
                  label={formData.type.charAt(0).toUpperCase() + formData.type.slice(1)}
                  color={getTypeColor(formData.type)}
                  variant="outlined"
                  sx={{ fontSize: 14, py: 0.5 }}
                />
              </CardContent>
            </Card>

            {/* Type-Specific Fields & Preview */}
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
                          Video Preview:
                        </Typography>
                        <Box
                          sx={{
                            position: 'relative',
                            width: '100%',
                            maxWidth: 560,
                            paddingTop: 'min(315px, 56.25%)',
                          }}
                        >
                          <iframe
                            src={`https://www.youtube.com/embed/${youtubeId}`}
                            title="YouTube video preview"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              border: 'none',
                              borderRadius: 8,
                            }}
                          />
                        </Box>
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
                      {formData.audio_url && (
                        <Box sx={{ mb: 1 }}>
                          <audio controls src={formData.audio_url} style={{ width: '100%', maxWidth: 480 }} />
                        </Box>
                      )}
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
                    </Box>

                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        Parent Photo (Optional)
                      </Typography>
                      {formData.parent_photo_url && (
                        <Box sx={{ mb: 1 }}>
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
                      {formData.image_url && (
                        <Box sx={{ mb: 1 }}>
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
              disabled={saving}
              sx={{ minHeight: 48 }}
            >
              {saving ? <CircularProgress size={24} /> : 'Save Changes'}
            </Button>
          </Grid>
        </Grid>
      </form>
    </Box>
  );
}
