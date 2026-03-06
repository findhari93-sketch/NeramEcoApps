'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Chip,
  Card,
  CardContent,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import MicIcon from '@mui/icons-material/Mic';
import PhotoIcon from '@mui/icons-material/Photo';
import StarIcon from '@mui/icons-material/Star';
import HomeIcon from '@mui/icons-material/Home';
import SearchIcon from '@mui/icons-material/Search';

interface SocialProof {
  id: string;
  type: 'video' | 'audio' | 'screenshot';
  speaker_name: string;
  student_name: string | null;
  batch: string | null;
  language: string;
  description: Record<string, string> | null;
  youtube_url: string | null;
  audio_url: string | null;
  image_url: string | null;
  parent_photo_url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  duration_seconds: number | null;
  display_order: number;
  is_featured: boolean;
  is_homepage: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface SocialProofStats {
  total: number;
  videos: number;
  audio: number;
  screenshots: number;
  featured: number;
}

export default function SocialProofsPage() {
  const router = useRouter();

  // Data
  const [socialProofs, setSocialProofs] = useState<SocialProof[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<SocialProofStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Filters
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [languageFilter, setLanguageFilter] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<string>('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchSocialProofs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set('include_stats', 'true');
      params.set('limit', String(rowsPerPage));
      params.set('offset', String(page * rowsPerPage));
      if (searchDebounced) params.set('search', searchDebounced);
      if (typeFilter) params.set('type', typeFilter);
      if (languageFilter) params.set('language', languageFilter);
      if (activeFilter) params.set('is_active', activeFilter);

      const res = await fetch(`/api/social-proofs?${params.toString()}`);
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to fetch social proofs');
      }

      setSocialProofs(json.data || []);
      setTotalCount(json.count || 0);
      if (json.stats) {
        setStats(json.stats);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, searchDebounced, typeFilter, languageFilter, activeFilter]);

  useEffect(() => {
    fetchSocialProofs();
  }, [fetchSocialProofs]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to deactivate "${name}"'s social proof?`)) return;

    try {
      setDeleteLoading(id);
      const res = await fetch(`/api/social-proofs/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to delete');
      }
      fetchSocialProofs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete social proof');
    } finally {
      setDeleteLoading(null);
    }
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video': return <PlayCircleIcon sx={{ fontSize: 16 }} />;
      case 'audio': return <MicIcon sx={{ fontSize: 16 }} />;
      case 'screenshot': return <PhotoIcon sx={{ fontSize: 16 }} />;
      default: return null;
    }
  };

  const getTypeColor = (type: string): 'error' | 'secondary' | 'success' | 'default' => {
    switch (type) {
      case 'video': return 'error';
      case 'audio': return 'secondary';
      case 'screenshot': return 'success';
      default: return 'default';
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
            Social Proofs
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage video, audio, and screenshot social proofs for the marketing site
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => router.push('/social-proofs/create')}
        >
          Add Social Proof
        </Button>
      </Box>

      {/* Stats Cards */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <GraphicEqIcon color="primary" sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    {stats.total}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <PlayCircleIcon color="error" sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    {stats.videos}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Videos
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <MicIcon color="secondary" sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    {stats.audio}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Audio
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <PhotoIcon color="success" sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    {stats.screenshots}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Screenshots
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <StarIcon color="warning" sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    {stats.featured}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Featured
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Filter Bar */}
      <Card sx={{ mb: 2.5 }}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Grid container spacing={1.5} alignItems="center">
            <Grid item xs={12} sm={3}>
              <TextField
                size="small"
                fullWidth
                placeholder="Search by speaker/student name..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary', fontSize: 20 }} />,
                }}
              />
            </Grid>
            <Grid item xs={6} sm={2}>
              <FormControl size="small" fullWidth>
                <InputLabel>Type</InputLabel>
                <Select
                  value={typeFilter}
                  label="Type"
                  onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
                >
                  <MenuItem value="">All Types</MenuItem>
                  <MenuItem value="video">Video</MenuItem>
                  <MenuItem value="audio">Audio</MenuItem>
                  <MenuItem value="screenshot">Screenshot</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={3}>
              <FormControl size="small" fullWidth>
                <InputLabel>Language</InputLabel>
                <Select
                  value={languageFilter}
                  label="Language"
                  onChange={(e) => { setLanguageFilter(e.target.value); setPage(0); }}
                >
                  <MenuItem value="">All Languages</MenuItem>
                  <MenuItem value="tamil">Tamil</MenuItem>
                  <MenuItem value="english">English</MenuItem>
                  <MenuItem value="hindi">Hindi</MenuItem>
                  <MenuItem value="kannada">Kannada</MenuItem>
                  <MenuItem value="malayalam">Malayalam</MenuItem>
                  <MenuItem value="telugu">Telugu</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={2}>
              <FormControl size="small" fullWidth>
                <InputLabel>Active</InputLabel>
                <Select
                  value={activeFilter}
                  label="Active"
                  onChange={(e) => { setActiveFilter(e.target.value); setPage(0); }}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="true">Active</MenuItem>
                  <MenuItem value="false">Inactive</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : socialProofs.length === 0 ? (
        <Paper sx={{ textAlign: 'center', py: 8 }}>
          <GraphicEqIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body1" color="text.secondary" gutterBottom>
            No social proofs found
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push('/social-proofs/create')}
            sx={{ mt: 2 }}
          >
            Add Your First Social Proof
          </Button>
        </Paper>
      ) : (
        <Paper sx={{ width: '100%', overflow: 'hidden' }}>
          <TableContainer sx={{ maxHeight: 600 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 100 }}>Type</TableCell>
                  <TableCell sx={{ minWidth: 140 }}>Speaker Name</TableCell>
                  <TableCell sx={{ minWidth: 120 }}>Student Name</TableCell>
                  <TableCell sx={{ width: 100 }}>Batch</TableCell>
                  <TableCell sx={{ width: 100 }}>Language</TableCell>
                  <TableCell sx={{ width: 80 }}>Featured</TableCell>
                  <TableCell sx={{ width: 80 }}>Homepage</TableCell>
                  <TableCell sx={{ width: 70 }}>Active</TableCell>
                  <TableCell sx={{ width: 100 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {socialProofs.map((sp) => (
                  <TableRow
                    key={sp.id}
                    hover
                    onClick={() => router.push(`/social-proofs/${sp.id}`)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>
                      <Chip
                        icon={getTypeIcon(sp.type) || undefined}
                        label={sp.type}
                        size="small"
                        color={getTypeColor(sp.type)}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500} noWrap>
                        {sp.speaker_name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap>
                        {sp.student_name || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap>
                        {sp.batch || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ textTransform: 'capitalize' }}>
                        {sp.language}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={sp.is_featured ? 'Yes' : 'No'}
                        size="small"
                        color={sp.is_featured ? 'warning' : 'default'}
                        variant={sp.is_featured ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={sp.is_homepage ? 'Yes' : 'No'}
                        size="small"
                        color={sp.is_homepage ? 'primary' : 'default'}
                        variant={sp.is_homepage ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={sp.is_active ? 'Active' : 'Inactive'}
                        size="small"
                        color={sp.is_active ? 'success' : 'error'}
                        variant={sp.is_active ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }} onClick={(e) => e.stopPropagation()}>
                        <Tooltip title="Edit">
                          <IconButton
                            size="small"
                            onClick={() => router.push(`/social-proofs/${sp.id}`)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Deactivate">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDelete(sp.id, sp.speaker_name)}
                            disabled={deleteLoading === sp.id}
                          >
                            {deleteLoading === sp.id ? (
                              <CircularProgress size={16} />
                            ) : (
                              <DeleteIcon fontSize="small" />
                            )}
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            rowsPerPageOptions={[10, 25, 50, 100]}
            component="div"
            count={totalCount}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
          />
        </Paper>
      )}
    </Box>
  );
}
