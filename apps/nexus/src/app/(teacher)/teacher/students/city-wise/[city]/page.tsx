'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Skeleton,
  TextField,
  IconButton,
  Chip,
  Tooltip,
  Snackbar,
  useTheme,
  useMediaQuery,
  alpha,
  Avatar,
  Button,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface CityStudent {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  user_type: string;
  city: string | null;
  state: string | null;
  course_name: string | null;
  enrolled_at: string | null;
}

export default function CityStudentsPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const router = useRouter();
  const params = useParams();
  const cityName = decodeURIComponent(params.city as string);
  const { getToken } = useNexusAuthContext();

  const [students, setStudents] = useState<CityStudent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const fetchStudents = useCallback(async (search?: string) => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      let url = `/api/students/city-wise/${encodeURIComponent(cityName)}?limit=100`;
      if (search) url += `&search=${encodeURIComponent(search)}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setStudents(data.students || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Failed to load students:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken, cityName]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // Debounced search
  useEffect(() => {
    if (searchQuery === '') {
      fetchStudents();
      return;
    }
    const timeout = setTimeout(() => {
      fetchStudents(searchQuery);
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCopy = useCallback((e: React.MouseEvent, text: string, label: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setSnackbar(`Copied ${label}`);
    });
  }, []);

  function getInitials(name: string) {
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <IconButton
          onClick={() => router.push('/teacher/students/city-wise')}
          size="small"
          sx={{ minWidth: 40, minHeight: 40 }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            {cityName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {total} {total === 1 ? 'student' : 'students'} in this city
          </Typography>
        </Box>
      </Box>

      {/* Search */}
      <TextField
        fullWidth
        placeholder="Search by name, email, or phone..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        size="small"
        sx={{ my: 2 }}
        inputProps={{ style: { minHeight: 24 } }}
      />

      {/* Student List */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : students.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <PersonOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body1" color="text.secondary">
            {searchQuery
              ? 'No students match your search.'
              : `No students found in ${cityName}.`}
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {students.map((student) => (
            <Paper
              key={student.id}
              variant="outlined"
              sx={{
                p: 2,
                borderRadius: 2,
                minHeight: 48,
                '&:hover': { backgroundColor: 'action.hover' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                {/* Avatar */}
                <Avatar
                  src={student.avatar_url || undefined}
                  sx={{
                    width: isMobile ? 44 : 48,
                    height: isMobile ? 44 : 48,
                    bgcolor: alpha(theme.palette.primary.main, 0.12),
                    color: 'primary.main',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                  }}
                >
                  {getInitials(student.name)}
                </Avatar>

                {/* Info */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Typography
                      variant="body1"
                      sx={{ fontWeight: 600, fontSize: { xs: '0.9rem', sm: '1rem' } }}
                      noWrap
                    >
                      {student.name}
                    </Typography>
                    <Chip
                      label={student.user_type}
                      size="small"
                      variant="outlined"
                      color={student.user_type === 'student' ? 'success' : 'default'}
                      sx={{ height: 20, fontSize: '0.65rem' }}
                    />
                  </Box>

                  {/* Contact info row */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                    {student.email && (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.25,
                          maxWidth: isMobile ? 160 : 'none',
                        }}
                      >
                        <EmailOutlinedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          noWrap
                          sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }}
                        >
                          {student.email}
                        </Typography>
                      </Box>
                    )}
                    {student.phone && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                        <PhoneOutlinedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }}
                        >
                          {student.phone}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Box>

                {/* Actions */}
                <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                  {student.email && (
                    <Tooltip title="Copy email">
                      <IconButton
                        size="small"
                        onClick={(e) => handleCopy(e, student.email!, student.email!)}
                        sx={{
                          width: 36,
                          height: 36,
                          bgcolor: alpha(theme.palette.primary.main, 0.06),
                          '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.12) },
                        }}
                      >
                        <ContentCopyOutlinedIcon sx={{ fontSize: '0.9rem' }} />
                      </IconButton>
                    </Tooltip>
                  )}
                  {student.phone && (
                    <Tooltip title="Copy phone">
                      <IconButton
                        size="small"
                        onClick={(e) => handleCopy(e, student.phone!, student.phone!)}
                        sx={{
                          width: 36,
                          height: 36,
                          bgcolor: alpha(theme.palette.secondary.main, 0.06),
                          '&:hover': { bgcolor: alpha(theme.palette.secondary.main, 0.12) },
                        }}
                      >
                        <PhoneOutlinedIcon sx={{ fontSize: '0.9rem' }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              </Box>

              {/* Enrolled date */}
              {student.enrolled_at && (
                <Typography
                  variant="caption"
                  color="text.disabled"
                  sx={{ mt: 0.75, display: 'block', ml: { xs: 0, sm: 7.5 }, fontSize: '0.7rem' }}
                >
                  Joined {new Date(student.enrolled_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </Typography>
              )}
            </Paper>
          ))}

          {/* Load more hint */}
          {total > students.length && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ textAlign: 'center', py: 2 }}
            >
              Showing {students.length} of {total} students
            </Typography>
          )}
        </Box>
      )}

      {/* Copy snackbar */}
      <Snackbar
        open={!!snackbar}
        autoHideDuration={2000}
        onClose={() => setSnackbar(null)}
        message={snackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{
          '& .MuiSnackbarContent-root': {
            minWidth: 'auto',
            borderRadius: 2,
            fontSize: '0.85rem',
          },
        }}
      />
    </Box>
  );
}
