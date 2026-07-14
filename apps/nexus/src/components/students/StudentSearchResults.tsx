'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  IconButton,
  Skeleton,
  Snackbar,
  Tooltip,
  useTheme,
} from '@neram/ui';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';
import GraphAvatar from '@/components/GraphAvatar';
import EmailDomainFlag from '@/components/students/EmailDomainFlag';
import type { EmailDomainStatus } from '@/lib/classroom-email';

/** A student returned by the geographic search (active population only). */
export interface GeoResultStudent {
  id: string;
  name: string;
  email: string | null;
  email_status?: EmailDomainStatus;
  phone: string | null;
  avatar_url?: string | null;
  ms_oid?: string | null;
  city: string | null;
  state: string | null;
  district?: string | null;
  country?: string | null;
  enrolled_at?: string | null;
}

interface StudentSearchResultsProps {
  students: GeoResultStudent[];
  total: number;
  loading: boolean;
  searchQuery: string;
}

export default function StudentSearchResults({
  students,
  total,
  loading,
  searchQuery,
}: StudentSearchResultsProps) {
  const theme = useTheme();
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setSnackbar(`${label} copied`);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" height={84} sx={{ borderRadius: 2 }} />
        ))}
      </Box>
    );
  }

  if (students.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', borderRadius: 2, borderStyle: 'dashed' }}>
        <SearchOffOutlinedIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
        <Typography variant="body1" sx={{ fontWeight: 600 }}>
          No students match &ldquo;{searchQuery}&rdquo;
        </Typography>
        <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
          Try searching by name, email, or phone number.
        </Typography>
      </Paper>
    );
  }

  const buildLocationBreadcrumb = (student: GeoResultStudent): string => {
    const parts = [student.city, student.district, student.state].filter(Boolean);
    return parts.join(', ');
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontWeight: 500 }}>
        {total} {total === 1 ? 'result' : 'results'} for &ldquo;{searchQuery}&rdquo;
        {total > students.length && ` (showing ${students.length})`}
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {students.map((student) => (
          <Paper
            key={student.id}
            variant="outlined"
            sx={{
              p: 2,
              borderRadius: 2,
              transition: 'border-color 0.2s',
              '&:hover': { borderColor: theme.palette.primary.light },
            }}
          >
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
              <GraphAvatar msOid={student.ms_oid} name={student.name} size={44} tapToView={false} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
                  {student.name}
                </Typography>
                {buildLocationBreadcrumb(student) && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                    <LocationOnOutlinedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {buildLocationBreadcrumb(student)}
                    </Typography>
                  </Box>
                )}
                {student.email_status && student.email_status !== 'org' && (
                  <Box sx={{ mt: 0.5 }}>
                    <EmailDomainFlag status={student.email_status} />
                  </Box>
                )}
              </Box>

              {/* Contact actions */}
              <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                {student.email && (
                  <Tooltip title={student.email} arrow>
                    <IconButton
                      size="small"
                      aria-label="Copy email"
                      onClick={() => copyToClipboard(student.email!, 'Email')}
                      sx={{ width: 40, height: 40, color: 'primary.main' }}
                    >
                      <EmailOutlinedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Tooltip>
                )}
                {student.phone && (
                  <Tooltip title={student.phone} arrow>
                    <IconButton
                      size="small"
                      aria-label="Copy phone"
                      onClick={() => copyToClipboard(student.phone!, 'Phone')}
                      sx={{ width: 40, height: 40, color: 'secondary.main' }}
                    >
                      <PhoneOutlinedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Tooltip>
                )}
                {student.email && (
                  <Tooltip title="Copy email">
                    <IconButton
                      size="small"
                      aria-label="Copy email text"
                      onClick={() => copyToClipboard(student.email!, 'Email')}
                      sx={{ width: 40, height: 40, display: { xs: 'none', sm: 'inline-flex' } }}
                    >
                      <ContentCopyIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            </Box>
          </Paper>
        ))}
      </Box>

      <Snackbar
        open={!!snackbar}
        autoHideDuration={2000}
        onClose={() => setSnackbar(null)}
        message={snackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
