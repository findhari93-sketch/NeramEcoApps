'use client';

import { useState, useRef } from 'react';
import {
  Box, TextField, Button, Chip, Typography, Paper, Dialog, DialogTitle,
  DialogContent, IconButton, Tabs, Tab, CircularProgress, InputAdornment,
  LinearProgress,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import LinkIcon from '@mui/icons-material/Link';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import VideoLibraryOutlinedIcon from '@mui/icons-material/VideoLibraryOutlined';
import YouTubeIcon from '@mui/icons-material/YouTube';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import type { TutorResource } from '@neram/database/types';

interface ResourceLinkSearchProps {
  resources: TutorResource[];
  onChange: (resources: TutorResource[]) => void;
  getToken: () => Promise<string | null>;
}

interface SearchResult {
  id: string;
  title: string;
  thumbnail_url?: string;
  channel_title?: string;
  url?: string;
}

export default function ResourceLinkSearch({ resources, onChange, getToken }: ResourceLinkSearchProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tab, setTab] = useState(0);

  // Library search
  const [libQuery, setLibQuery] = useState('');
  const [libResults, setLibResults] = useState<SearchResult[]>([]);
  const [libSearching, setLibSearching] = useState(false);

  // YouTube search
  const [ytQuery, setYtQuery] = useState('');
  const [ytResults, setYtResults] = useState<SearchResult[]>([]);
  const [ytSearching, setYtSearching] = useState(false);
  const [ytPasteUrl, setYtPasteUrl] = useState('');

  // Image upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [imageTitle, setImageTitle] = useState('');
  const [uploading, setUploading] = useState(false);

  const removeResource = (index: number) => {
    onChange(resources.filter((_, i) => i !== index));
  };

  const addResource = (r: TutorResource) => {
    if (resources.some((existing) => existing.url === r.url)) return;
    onChange([...resources, r]);
  };

  // --- Library search ---
  const searchLibrary = async () => {
    if (!libQuery.trim()) return;
    setLibSearching(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/library/videos?search=${encodeURIComponent(libQuery)}&limit=8`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setLibResults((data.videos || []).map((v: any) => ({
        id: v.id,
        title: v.title,
        thumbnail_url: v.thumbnail_url,
        channel_title: 'Neram Classes',
      })));
    } catch {
      setLibResults([]);
    } finally {
      setLibSearching(false);
    }
  };

  // --- YouTube search ---
  const searchYouTube = async () => {
    if (!ytQuery.trim()) return;
    setYtSearching(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/drawing/youtube-search?q=${encodeURIComponent(ytQuery)}&limit=6`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setYtResults(data.results || []);
    } catch {
      setYtResults([]);
    } finally {
      setYtSearching(false);
    }
  };

  const isYouTubeUrl = (url: string) => /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url);

  const addYouTubePaste = () => {
    if (!isYouTubeUrl(ytPasteUrl)) return;
    addResource({ type: 'youtube', url: ytPasteUrl, title: 'YouTube Video' });
    setYtPasteUrl('');
  };

  // --- Image upload ---
  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) return;
    setUploading(true);
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'drawing-references');
      const res = await fetch('/api/drawing/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const { url } = await res.json();
      addResource({
        type: 'image',
        url,
        title: imageTitle || file.name.replace(/\.[^.]+$/, ''),
        thumbnail_url: url,
      });
      setImageTitle('');
    } catch {
      // silent
    } finally {
      setUploading(false);
    }
  };

  const addImageUrl = () => {
    if (!imageUrl.trim()) return;
    addResource({
      type: 'image',
      url: imageUrl,
      title: imageTitle || 'Reference Image',
      thumbnail_url: imageUrl,
    });
    setImageUrl('');
    setImageTitle('');
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="caption" fontWeight={600} color="text.secondary">
          RESOURCES {resources.length > 0 && `(${resources.length})`}
        </Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => setDialogOpen(true)}
          sx={{ textTransform: 'none', minHeight: 32 }}
        >
          Add
        </Button>
      </Box>

      {/* Current resources */}
      {resources.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {resources.map((r, i) => (
            <Chip
              key={i}
              icon={
                r.type === 'image'
                  ? <ImageOutlinedIcon sx={{ fontSize: 16 }} />
                  : r.type === 'youtube'
                  ? <YouTubeIcon sx={{ fontSize: 16, color: '#ff0000' }} />
                  : <PlayCircleOutlineIcon sx={{ fontSize: 16 }} />
              }
              label={r.title}
              onDelete={() => removeResource(i)}
              variant="outlined"
              sx={{ justifyContent: 'flex-start', maxWidth: '100%' }}
            />
          ))}
        </Box>
      )}

      {/* Resource dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { maxHeight: '80vh' } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', pb: 0.5 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>
            Add Resource
          </Typography>
          <IconButton onClick={() => setDialogOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ px: 3, '& .MuiTab-root': { textTransform: 'none', minHeight: 40, py: 0.5 } }}
        >
          <Tab icon={<VideoLibraryOutlinedIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Library" />
          <Tab icon={<YouTubeIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="YouTube" />
          <Tab icon={<ImageOutlinedIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Image" />
        </Tabs>

        <DialogContent sx={{ px: 3, pt: 2 }}>
          {/* === Library Tab === */}
          {tab === 0 && (
            <Box>
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  placeholder="Search class recordings..."
                  size="small"
                  fullWidth
                  value={libQuery}
                  onChange={(e) => setLibQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchLibrary()}
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment>,
                  }}
                />
                <Button variant="contained" size="small" onClick={searchLibrary} disabled={libSearching} sx={{ minWidth: 80, textTransform: 'none' }}>
                  {libSearching ? <CircularProgress size={18} /> : 'Search'}
                </Button>
              </Box>
              {libResults.length === 0 && !libSearching && libQuery && (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                  No videos found. Try different keywords.
                </Typography>
              )}
              {libResults.map((v) => (
                <Paper key={v.id} variant="outlined" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1, mb: 1, '&:hover': { bgcolor: 'action.hover' } }}>
                  {v.thumbnail_url ? (
                    <Box component="img" src={v.thumbnail_url} alt="" sx={{ width: 80, height: 50, objectFit: 'cover', borderRadius: 0.5, flexShrink: 0 }} />
                  ) : (
                    <Box sx={{ width: 80, height: 50, bgcolor: 'grey.200', borderRadius: 0.5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <VideoLibraryOutlinedIcon sx={{ color: 'grey.400' }} />
                    </Box>
                  )}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={500} noWrap>{v.title}</Typography>
                    <Typography variant="caption" color="text.secondary">{v.channel_title}</Typography>
                  </Box>
                  <Button
                    size="small" variant="outlined"
                    onClick={() => {
                      addResource({ type: 'nexus_video', url: `/student/library/${v.id}`, title: v.title, thumbnail_url: v.thumbnail_url });
                    }}
                    sx={{ textTransform: 'none', minWidth: 60 }}
                  >
                    Add
                  </Button>
                </Paper>
              ))}
            </Box>
          )}

          {/* === YouTube Tab === */}
          {tab === 1 && (
            <Box>
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  placeholder="Search YouTube..."
                  size="small"
                  fullWidth
                  value={ytQuery}
                  onChange={(e) => setYtQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchYouTube()}
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment>,
                  }}
                />
                <Button variant="contained" size="small" onClick={searchYouTube} disabled={ytSearching} sx={{ minWidth: 80, textTransform: 'none' }}>
                  {ytSearching ? <CircularProgress size={18} /> : 'Search'}
                </Button>
              </Box>
              {ytResults.map((v) => (
                <Paper key={v.id} variant="outlined" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1, mb: 1, '&:hover': { bgcolor: 'action.hover' } }}>
                  {v.thumbnail_url && (
                    <Box component="img" src={v.thumbnail_url} alt="" sx={{ width: 80, height: 50, objectFit: 'cover', borderRadius: 0.5, flexShrink: 0 }} />
                  )}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={500} sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {v.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{v.channel_title}</Typography>
                  </Box>
                  <Button
                    size="small" variant="outlined"
                    onClick={() => {
                      addResource({ type: 'youtube', url: v.url || `https://youtube.com/watch?v=${v.id}`, title: v.title, thumbnail_url: v.thumbnail_url });
                    }}
                    sx={{ textTransform: 'none', minWidth: 60 }}
                  >
                    Add
                  </Button>
                </Paper>
              ))}

              {/* Paste URL fallback */}
              <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  Or paste a YouTube URL directly
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    placeholder="https://youtube.com/watch?v=..."
                    size="small"
                    fullWidth
                    value={ytPasteUrl}
                    onChange={(e) => setYtPasteUrl(e.target.value)}
                    InputProps={{
                      startAdornment: <InputAdornment position="start"><LinkIcon sx={{ fontSize: 18 }} /></InputAdornment>,
                    }}
                    error={ytPasteUrl.length > 0 && !isYouTubeUrl(ytPasteUrl)}
                  />
                  <Button
                    variant="outlined" size="small"
                    onClick={addYouTubePaste}
                    disabled={!isYouTubeUrl(ytPasteUrl)}
                    sx={{ textTransform: 'none', minWidth: 60 }}
                  >
                    Add
                  </Button>
                </Box>
              </Box>
            </Box>
          )}

          {/* === Image Tab === */}
          {tab === 2 && (
            <Box>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                }}
              />

              <TextField
                placeholder="Title for the reference image (optional)"
                size="small"
                fullWidth
                value={imageTitle}
                onChange={(e) => setImageTitle(e.target.value)}
                sx={{ mb: 2 }}
              />

              <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
                <Button
                  variant="outlined"
                  startIcon={<CloudUploadOutlinedIcon />}
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  sx={{ flex: 1, textTransform: 'none', minHeight: 48 }}
                >
                  {uploading ? 'Uploading...' : 'Upload Image'}
                </Button>
              </Box>

              {uploading && <LinearProgress sx={{ mb: 2 }} />}

              {/* Or paste URL */}
              <Box sx={{ pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  Or paste an image URL
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    placeholder="https://example.com/image.jpg"
                    size="small"
                    fullWidth
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    InputProps={{
                      startAdornment: <InputAdornment position="start"><LinkIcon sx={{ fontSize: 18 }} /></InputAdornment>,
                    }}
                  />
                  <Button
                    variant="outlined" size="small"
                    onClick={addImageUrl}
                    disabled={!imageUrl.trim()}
                    sx={{ textTransform: 'none', minWidth: 60 }}
                  >
                    Add
                  </Button>
                </Box>
                {imageUrl && (
                  <Box component="img" src={imageUrl} alt="Preview" sx={{ mt: 1, maxHeight: 150, borderRadius: 1, objectFit: 'contain' }} />
                )}
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
