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
  Avatar,
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
import StarIcon from '@mui/icons-material/Star';
import LocationCityIcon from '@mui/icons-material/LocationCity';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import SearchIcon from '@mui/icons-material/Search';
import type { Testimonial, TestimonialLearningMode } from '@neram/database';

interface TestimonialStats {
  total: number;
  avgRating: number;
  citiesCount: number;
  featuredCount: number;
}

export default function TestimonialsPage() {
  const router = useRouter();

  // Data
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<TestimonialStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Filters
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('');
  const [cityFilter, setCityFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [modeFilter, setModeFilter] = useState<string>('');

  // Filter options (extracted from data)
  const [filterOptions, setFilterOptions] = useState<{
    years: number[];
    cities: string[];
    courses: string[];
  }>({ years: [], cities: [], courses: [] });

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchTestimonials = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set('include_stats', 'true');
      params.set('limit', String(rowsPerPage));
      params.set('offset', String(page * rowsPerPage));
      if (searchDebounced) params.set('search', searchDebounced);
      if (yearFilter) params.set('year', yearFilter);
      if (cityFilter) params.set('city', cityFilter);
      if (courseFilter) params.set('course_name', courseFilter);
      if (modeFilter) params.set('learning_mode', modeFilter);

      const res = await fetch(`/api/testimonials?${params.toString()}`);
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to fetch testimonials');
      }

      setTestimonials(json.data || []);
      setTotalCount(json.count || 0);
      if (json.stats) {
        setStats(json.stats);
      }

      // Build filter options from all testimonials (first load only)
      if (!filterOptions.years.length && json.data?.length) {
        const years = ([...new Set(json.data.map((t: Testimonial) => t.year))] as number[]).sort(
          (a, b) => b - a
        );
        const cities = [...new Set(json.data.map((t: Testimonial) => t.city))].sort();
        const courses = [...new Set(json.data.map((t: Testimonial) => t.course_name))].sort();
        setFilterOptions({ years: years as number[], cities: cities as string[], courses: courses as string[] });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, searchDebounced, yearFilter, cityFilter, courseFilter, modeFilter]);

  useEffect(() => {
    fetchTestimonials();
  }, [fetchTestimonials]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to deactivate "${name}"'s testimonial?`)) return;

    try {
      setDeleteLoading(id);
      const res = await fetch(`/api/testimonials/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to delete');
      }
      fetchTestimonials();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete testimonial');
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

  const getExamLabel = (exam: string) => {
    switch (exam) {
      case 'NATA': return 'NATA';
      case 'JEE_PAPER_2': return 'JEE Paper 2';
      case 'BOTH': return 'Both';
      default: return exam;
    }
  };

  const getModeColor = (mode: TestimonialLearningMode) => {
    switch (mode) {
      case 'online': return 'info';
      case 'hybrid': return 'warning';
      case 'offline': return 'success';
      default: return 'default';
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
            Testimonials
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage student testimonials displayed on the marketing site
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => router.push('/testimonials/create')}
        >
          Add Testimonial
        </Button>
      </Box>

      {/* Stats Cards */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <FormatQuoteIcon color="primary" sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    {stats.total}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Testimonials
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <EmojiEventsIcon color="warning" sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    {stats.featuredCount}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Featured
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <StarIcon color="info" sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    {stats.avgRating || '-'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Avg Rating
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <LocationCityIcon color="success" sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h4" fontWeight="bold">
                    {stats.citiesCount}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Cities
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
                placeholder="Search by name..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary', fontSize: 20 }} />,
                }}
              />
            </Grid>
            <Grid item xs={6} sm={2}>
              <FormControl size="small" fullWidth>
                <InputLabel>Year</InputLabel>
                <Select
                  value={yearFilter}
                  label="Year"
                  onChange={(e) => { setYearFilter(e.target.value); setPage(0); }}
                >
                  <MenuItem value="">All Years</MenuItem>
                  {filterOptions.years.map((y) => (
                    <MenuItem key={y} value={String(y)}>{y}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={2}>
              <FormControl size="small" fullWidth>
                <InputLabel>City</InputLabel>
                <Select
                  value={cityFilter}
                  label="City"
                  onChange={(e) => { setCityFilter(e.target.value); setPage(0); }}
                >
                  <MenuItem value="">All Cities</MenuItem>
                  {filterOptions.cities.map((c) => (
                    <MenuItem key={c} value={c}>{c}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={2.5}>
              <FormControl size="small" fullWidth>
                <InputLabel>Course</InputLabel>
                <Select
                  value={courseFilter}
                  label="Course"
                  onChange={(e) => { setCourseFilter(e.target.value); setPage(0); }}
                >
                  <MenuItem value="">All Courses</MenuItem>
                  {filterOptions.courses.map((c) => (
                    <MenuItem key={c} value={c}>{c}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={2.5}>
              <FormControl size="small" fullWidth>
                <InputLabel>Mode</InputLabel>
                <Select
                  value={modeFilter}
                  label="Mode"
                  onChange={(e) => { setModeFilter(e.target.value); setPage(0); }}
                >
                  <MenuItem value="">All Modes</MenuItem>
                  <MenuItem value="online">Online</MenuItem>
                  <MenuItem value="hybrid">Hybrid</MenuItem>
                  <MenuItem value="offline">Offline</MenuItem>
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
      ) : testimonials.length === 0 ? (
        <Paper sx={{ textAlign: 'center', py: 8 }}>
          <FormatQuoteIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body1" color="text.secondary" gutterBottom>
            No testimonials found
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push('/testimonials/create')}
            sx={{ mt: 2 }}
          >
            Add Your First Testimonial
          </Button>
        </Paper>
      ) : (
        <Paper sx={{ width: '100%', overflow: 'hidden' }}>
          <TableContainer sx={{ maxHeight: 600 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 50 }}>Photo</TableCell>
                  <TableCell sx={{ minWidth: 140 }}>Name</TableCell>
                  <TableCell sx={{ width: 100 }}>Exam</TableCell>
                  <TableCell sx={{ width: 110 }}>Score / Rank</TableCell>
                  <TableCell sx={{ width: 100 }}>City</TableCell>
                  <TableCell sx={{ minWidth: 120 }}>Course</TableCell>
                  <TableCell sx={{ width: 80 }}>Mode</TableCell>
                  <TableCell sx={{ width: 60 }}>Year</TableCell>
                  <TableCell sx={{ width: 80 }}>Featured</TableCell>
                  <TableCell sx={{ width: 80 }}>Homepage</TableCell>
                  <TableCell sx={{ width: 70 }}>Active</TableCell>
                  <TableCell sx={{ width: 100 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {testimonials.map((t) => (
                  <TableRow
                    key={t.id}
                    hover
                    onClick={() => router.push(`/testimonials/${t.id}`)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>
                      <Avatar
                        src={t.student_photo || undefined}
                        sx={{ width: 32, height: 32, fontSize: 14 }}
                      >
                        {t.student_name.charAt(0)}
                      </Avatar>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500} noWrap>
                        {t.student_name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={getExamLabel(t.exam_type)} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {t.score != null ? `Score: ${t.score}` : ''}
                        {t.score != null && t.rank != null ? ' / ' : ''}
                        {t.rank != null ? `Rank: ${t.rank}` : ''}
                        {t.score == null && t.rank == null ? '-' : ''}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap>{t.city}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap>{t.course_name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={t.learning_mode}
                        size="small"
                        color={getModeColor(t.learning_mode) as any}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{t.year}</TableCell>
                    <TableCell>
                      <Chip
                        label={t.is_featured ? 'Yes' : 'No'}
                        size="small"
                        color={t.is_featured ? 'warning' : 'default'}
                        variant={t.is_featured ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={t.is_homepage ? 'Yes' : 'No'}
                        size="small"
                        color={t.is_homepage ? 'primary' : 'default'}
                        variant={t.is_homepage ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={t.is_active ? 'Active' : 'Inactive'}
                        size="small"
                        color={t.is_active ? 'success' : 'error'}
                        variant={t.is_active ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }} onClick={(e) => e.stopPropagation()}>
                        <Tooltip title="Edit">
                          <IconButton
                            size="small"
                            onClick={() => router.push(`/testimonials/${t.id}`)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Deactivate">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDelete(t.id, t.student_name)}
                            disabled={deleteLoading === t.id}
                          >
                            {deleteLoading === t.id ? (
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
