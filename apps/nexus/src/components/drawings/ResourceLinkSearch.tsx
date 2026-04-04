'use client';

import { useState } from 'react';
import {
  Box, TextField, Button, Chip, Typography, Paper,
  ToggleButton, ToggleButtonGroup, CircularProgress, InputAdornment,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import LinkIcon from '@mui/icons-material/Link';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import type { TutorResource } from '@neram/database/types';

interface ResourceLinkSearchProps {
  resources: TutorResource[];
  onChange: (resources: TutorResource[]) => void;
  getToken: () => Promise<string | null>;
}

interface LibraryVideo {
  id: string;
  title: string;
}

export default function ResourceLinkSearch({ resources, onChange, getToken }: ResourceLinkSearchProps) {
  const [mode, setMode] = useState<'library' | 'youtube'>('library');
  const [query, setQuery] = useState('');
  const [ytUrl, setYtUrl] = useState('');
  const [ytTitle, setYtTitle] = useState('');
  const [results, setResults] = useState<LibraryVideo[]>([]);
  const [searching, setSearching] = useState(false);

  const searchLibrary = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/library/videos?search=${encodeURIComponent(query)}&limit=5`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setResults((data.videos || []).map((v: any) => ({ id: v.id, title: v.title })));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const addLibraryVideo = (video: LibraryVideo) => {
    if (resources.some((r) => r.url.includes(video.id))) return;
    onChange([...resources, {
      type: 'nexus_video',
      url: `/student/library/${video.id}`,
      title: video.title,
    }]);
    setResults([]);
    setQuery('');
  };

  const isYouTubeUrl = (url: string) => /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url);

  const addYouTubeLink = () => {
    if (!isYouTubeUrl(ytUrl) || !ytTitle.trim()) return;
    onChange([...resources, { type: 'youtube', url: ytUrl, title: ytTitle }]);
    setYtUrl('');
    setYtTitle('');
  };

  const removeResource = (index: number) => {
    onChange(resources.filter((_, i) => i !== index));
  };

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={600} gutterBottom>
        Resource Links
      </Typography>

      {resources.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 1.5 }}>
          {resources.map((r, i) => (
            <Chip
              key={i}
              icon={<PlayCircleOutlineIcon sx={{ fontSize: 16 }} />}
              label={r.title}
              onDelete={() => removeResource(i)}
              variant="outlined"
              sx={{ justifyContent: 'flex-start', maxWidth: '100%' }}
            />
          ))}
        </Box>
      )}

      <ToggleButtonGroup value={mode} exclusive onChange={(_, v) => v && setMode(v)} size="small" sx={{ mb: 1.5 }}>
        <ToggleButton value="library" sx={{ textTransform: 'none', px: 2 }}>Search Library</ToggleButton>
        <ToggleButton value="youtube" sx={{ textTransform: 'none', px: 2 }}>YouTube URL</ToggleButton>
      </ToggleButtonGroup>

      {mode === 'library' ? (
        <Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              placeholder="Search class recordings..."
              size="small"
              fullWidth
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchLibrary()}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment>,
              }}
            />
            <Button variant="outlined" size="small" onClick={searchLibrary} disabled={searching} sx={{ minWidth: 80 }}>
              {searching ? <CircularProgress size={16} /> : 'Search'}
            </Button>
          </Box>
          {results.length > 0 && (
            <Paper variant="outlined" sx={{ mt: 1 }}>
              {results.map((v) => (
                <Box
                  key={v.id}
                  sx={{ p: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' }, borderBottom: '1px solid', borderColor: 'divider' }}
                  onClick={() => addLibraryVideo(v)}
                >
                  <Typography variant="body2">{v.title}</Typography>
                </Box>
              ))}
            </Paper>
          )}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <TextField
            placeholder="https://youtube.com/watch?v=..."
            size="small"
            fullWidth
            value={ytUrl}
            onChange={(e) => setYtUrl(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start"><LinkIcon sx={{ fontSize: 18 }} /></InputAdornment>,
            }}
            error={ytUrl.length > 0 && !isYouTubeUrl(ytUrl)}
            helperText={ytUrl.length > 0 && !isYouTubeUrl(ytUrl) ? 'Invalid YouTube URL' : ''}
          />
          <TextField
            placeholder="Video title"
            size="small"
            fullWidth
            value={ytTitle}
            onChange={(e) => setYtTitle(e.target.value)}
          />
          <Button
            variant="outlined"
            size="small"
            onClick={addYouTubeLink}
            disabled={!isYouTubeUrl(ytUrl) || !ytTitle.trim()}
            sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
          >
            Add Link
          </Button>
        </Box>
      )}
    </Box>
  );
}
