'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  Button,
  TextField,
  InputAdornment,
} from '@neram/ui';
import PlayCircleOutlinedIcon from '@mui/icons-material/PlayCircleOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import NoteOutlinedIcon from '@mui/icons-material/NoteOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ProtectedContent from '@/components/ProtectedContent';

interface Resource {
  id: string;
  title: string;
  description: string | null;
  resource_type: string;
  url: string;
  thumbnail_url: string | null;
  topic: { id: string; title: string; category: string } | null;
}

const typeIcons: Record<string, React.ReactNode> = {
  youtube: <PlayCircleOutlinedIcon sx={{ fontSize: 20, color: '#FF0000' }} />,
  pdf: <PictureAsPdfOutlinedIcon sx={{ fontSize: 20, color: '#E53935' }} />,
  onenote: <NoteOutlinedIcon sx={{ fontSize: 20, color: '#7719AA' }} />,
  image: <ImageOutlinedIcon sx={{ fontSize: 20, color: '#1976D2' }} />,
  link: <LinkOutlinedIcon sx={{ fontSize: 20, color: '#666' }} />,
};

export default function StudentResources() {
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);

  useEffect(() => {
    if (!activeClassroom) return;

    async function fetchResources() {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) return;

        const res = await fetch(
          `/api/resources?classroom=${activeClassroom!.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setResources(data.resources || []);
        }
      } catch (err) {
        console.error('Failed to load resources:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchResources();
  }, [activeClassroom, getToken]);

  const filtered = resources.filter((r) => {
    if (selectedType && r.resource_type !== selectedType) return false;
    if (search && !r.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const types = [...new Set(resources.map((r) => r.resource_type))];

  return (
    <Box>
      <Typography variant="h6" component="h1" sx={{ fontWeight: 700, mb: 2 }}>
        Resources
      </Typography>

      {/* Search & filter */}
      <Box sx={{ mb: 2 }}>
        <TextField
          placeholder="Search resources..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          fullWidth
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlinedIcon sx={{ fontSize: 20 }} />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 1 }}
        />
        {types.length > 1 && (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            <Chip
              label="All"
              size="small"
              variant={!selectedType ? 'filled' : 'outlined'}
              onClick={() => setSelectedType(null)}
            />
            {types.map((type) => (
              <Chip
                key={type}
                label={type}
                size="small"
                variant={selectedType === type ? 'filled' : 'outlined'}
                onClick={() => setSelectedType(type === selectedType ? null : type)}
                sx={{ textTransform: 'capitalize' }}
              />
            ))}
          </Box>
        )}
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rectangular" height={64} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : filtered.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {resources.length === 0
              ? 'No resources have been added yet.'
              : 'No resources match your filter.'}
          </Typography>
        </Paper>
      ) : (
        <ProtectedContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {filtered.map((resource) => (
              <Paper
                key={resource.id}
                variant="outlined"
                component="a"
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  p: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  textDecoration: 'none',
                  color: 'inherit',
                  '&:hover': { bgcolor: 'action.hover' },
                  '&:active': { bgcolor: 'action.selected' },
                }}
              >
                {typeIcons[resource.resource_type] || typeIcons.link}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {resource.title}
                  </Typography>
                  {resource.description && (
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {resource.description}
                    </Typography>
                  )}
                </Box>
                {resource.topic && (
                  <Chip label={resource.topic.title} size="small" variant="outlined" />
                )}
              </Paper>
            ))}
          </Box>
        </ProtectedContent>
      )}
    </Box>
  );
}
