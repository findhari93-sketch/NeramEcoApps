'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Skeleton,
  TextField,
  IconButton,
  Tooltip,
  Snackbar,
  useTheme,
  useMediaQuery,
  alpha,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import GraphAvatar from '@/components/GraphAvatar';
import StudentsBreadcrumb, { type Crumb } from '@/components/students/StudentsBreadcrumb';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface CityStudent {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  ms_oid: string | null;
  city: string | null;
  state: string | null;
  enrolled_at: string | null;
}

const COUNTRY_NAMES: Record<string, string> = {
  IN: 'India', AE: 'UAE', US: 'United States', GB: 'United Kingdom', SG: 'Singapore',
  MY: 'Malaysia', QA: 'Qatar', SA: 'Saudi Arabia', OM: 'Oman', KW: 'Kuwait', BH: 'Bahrain',
};
const countryDisplay = (code: string | null) => (code ? COUNTRY_NAMES[code.toUpperCase()] || code.toUpperCase() : null);

function CityStudentsPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const cityName = decodeURIComponent(params.city as string);
  const stateParam = searchParams.get('state');
  const countryParam = searchParams.get('country');
  const { getToken } = useNexusAuthContext();

  const [students, setStudents] = useState<CityStudent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const fetchStudents = useCallback(
    async (search?: string) => {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) return;

        const sp = new URLSearchParams({ limit: '100' });
        if (stateParam) sp.set('state', stateParam);
        if (countryParam) sp.set('country', countryParam);
        if (search) sp.set('search', search);

        const res = await fetch(`/api/students/city-wise/${encodeURIComponent(cityName)}?${sp.toString()}`, {
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
    },
    [getToken, cityName, stateParam, countryParam],
  );

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  useEffect(() => {
    if (searchQuery === '') {
      fetchStudents();
      return;
    }
    const timeout = setTimeout(() => fetchStudents(searchQuery), 400);
    return () => clearTimeout(timeout);
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCopy = useCallback((e: React.MouseEvent, text: string, label: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => setSnackbar(`Copied ${label}`));
  }, []);

  // Back returns to the city list for this state (level 2), or the top if unknown.
  const backToCities = useCallback(() => {
    const sp = new URLSearchParams();
    if (countryParam) sp.set('country', countryParam);
    if (stateParam) sp.set('state', stateParam);
    const qs = sp.toString();
    router.push(`/teacher/students/city-wise${qs ? `?${qs}` : ''}`);
  }, [router, countryParam, stateParam]);

  const crumbs: Crumb[] = [{ label: 'All countries', onClick: () => router.push('/teacher/students/city-wise') }];
  if (countryParam) {
    crumbs.push({
      label: countryDisplay(countryParam) || countryParam,
      onClick: () => router.push(`/teacher/students/city-wise?country=${encodeURIComponent(countryParam)}`),
    });
  }
  if (stateParam) crumbs.push({ label: stateParam, onClick: backToCities });
  crumbs.push({ label: cityName });

  return (
    <Box>
      <StudentsBreadcrumb items={crumbs} />

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton onClick={backToCities} size="small" aria-label="Back" sx={{ minWidth: 40, minHeight: 40 }}>
          <ArrowBackIcon />
        </IconButton>
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 800 }}>
            {cityName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {total} {total === 1 ? 'student' : 'students'}
            {stateParam ? ` in ${stateParam}` : ''}
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
        sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2.5, bgcolor: 'background.paper' } }}
        inputProps={{ style: { minHeight: 24 } }}
      />

      {/* Student list */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : students.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', borderRadius: 2, borderStyle: 'dashed' }}>
          <PersonOutlinedIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            {searchQuery ? 'No students match your search' : `No students found in ${cityName}`}
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {students.map((student) => (
            <Paper
              key={student.id}
              variant="outlined"
              onClick={() => router.push(`/teacher/students/${student.id}`)}
              sx={{
                p: 2,
                borderRadius: 2,
                minHeight: 48,
                cursor: 'pointer',
                transition: 'background-color .2s, border-color .2s',
                '&:hover': { backgroundColor: 'action.hover', borderColor: alpha(theme.palette.primary.main, 0.4) },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <GraphAvatar msOid={student.ms_oid} name={student.name} size={isMobile ? 44 : 48} tapToView={false} />

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="body1"
                    sx={{ fontWeight: 700, fontSize: { xs: '0.92rem', sm: '1rem' } }}
                    noWrap
                  >
                    {student.name}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25, flexWrap: 'wrap' }}>
                    {student.email && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, maxWidth: isMobile ? 180 : 'none' }}>
                        <EmailOutlinedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }}>
                          {student.email}
                        </Typography>
                      </Box>
                    )}
                    {student.phone && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                        <PhoneOutlinedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }}>
                          {student.phone}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                  {student.email && (
                    <Tooltip title="Copy email">
                      <IconButton
                        size="small"
                        aria-label="Copy email"
                        onClick={(e) => handleCopy(e, student.email!, student.email!)}
                        sx={{ width: 40, height: 40, bgcolor: alpha(theme.palette.primary.main, 0.06), '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.14) } }}
                      >
                        <ContentCopyOutlinedIcon sx={{ fontSize: '0.9rem' }} />
                      </IconButton>
                    </Tooltip>
                  )}
                  {student.phone && (
                    <Tooltip title="Copy phone">
                      <IconButton
                        size="small"
                        aria-label="Copy phone"
                        onClick={(e) => handleCopy(e, student.phone!, student.phone!)}
                        sx={{ width: 40, height: 40, bgcolor: alpha(theme.palette.secondary.main, 0.06), '&:hover': { bgcolor: alpha(theme.palette.secondary.main, 0.14) } }}
                      >
                        <PhoneOutlinedIcon sx={{ fontSize: '0.9rem' }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              </Box>

              {student.enrolled_at && (
                <Typography
                  variant="caption"
                  color="text.disabled"
                  sx={{ mt: 0.75, display: 'block', ml: { xs: 0, sm: 7.5 }, fontSize: '0.7rem' }}
                >
                  Joined {new Date(student.enrolled_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Typography>
              )}
            </Paper>
          ))}

          {total > students.length && (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              Showing {students.length} of {total} students
            </Typography>
          )}
        </Box>
      )}

      <Snackbar
        open={!!snackbar}
        autoHideDuration={2000}
        onClose={() => setSnackbar(null)}
        message={snackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ '& .MuiSnackbarContent-root': { minWidth: 'auto', borderRadius: 2, fontSize: '0.85rem' } }}
      />
    </Box>
  );
}

export default function CityStudentsPageWrapper() {
  return (
    <Suspense fallback={<Box sx={{ py: 4 }} />}>
      <CityStudentsPage />
    </Suspense>
  );
}
