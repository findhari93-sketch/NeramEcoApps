'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Avatar,
  Chip,
  IconButton,
  Skeleton,
  Snackbar,
  Tooltip,
  alpha,
  useTheme,
} from '@neram/ui';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import type { GeographicStudent } from '@neram/database';

interface StudentSearchResultsProps {
  students: GeographicStudent[];
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
          <Skeleton key={i} variant="rounded" height={100} sx={{ borderRadius: 2 }} />
        ))}
      </Box>
    );
  }

  if (students.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="body1" color="text.secondary">
          No students match "{searchQuery}"
        </Typography>
        <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
          Try searching by name, email, or phone number.
        </Typography>
      </Paper>
    );
  }

  const buildLocationBreadcrumb = (student: GeographicStudent): string => {
    const parts = [student.city, student.district, student.state].filter(Boolean);
    return parts.join(', ');
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontWeight: 500 }}>
        {total} {total === 1 ? 'result' : 'results'} for "{searchQuery}"
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
              '&:hover': {
                borderColor: theme.palette.primary.light,
              },
            }}
          >
            <Box sx={{ display: 'flex', gap: 2, alignItems: { xs: 'flex-start', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' } }}>
              {/* Avatar + Name */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 0 }}>
                <Avatar
                  src={student.avatar_url || undefined}
                  sx={{
                    width: 40,
                    height: 40,
                    bgcolor: alpha(theme.palette.primary.main, 0.15),
                    color: 'primary.main',
                    fontWeight: 700,
                    fontSize: 16,
                  }}
                >
                  {student.name?.charAt(0)?.toUpperCase()}
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
                      {student.name}
                    </Typography>
                    <Chip
                      label={student.user_type}
                      size="small"
                      color={student.user_type === 'student' ? 'success' : 'default'}
                      sx={{ height: 20, fontSize: 11 }}
                    />
                  </Box>
                  {/* Location breadcrumb */}
                  {buildLocationBreadcrumb(student) && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                      <LocationOnOutlinedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {buildLocationBreadcrumb(student)}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Box>

              {/* Contact info */}
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                {student.email && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <EmailOutlinedIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                    <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 180 }} noWrap>
                      {student.email}
                    </Typography>
                    <Tooltip title="Copy email">
                      <IconButton
                        size="small"
                        onClick={() => copyToClipboard(student.email!, 'Email')}
                        sx={{ p: 0.5 }}
                      >
                        <ContentCopyIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
                {student.phone && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <PhoneOutlinedIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                    <Typography variant="caption" color="text.secondary">
                      {student.phone}
                    </Typography>
                    <Tooltip title="Copy phone">
                      <IconButton
                        size="small"
                        onClick={() => copyToClipboard(student.phone!, 'Phone')}
                        sx={{ p: 0.5 }}
                      >
                        <ContentCopyIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
              </Box>
            </Box>

            {/* Bottom row: course + date */}
            {(student.course_name || student.enrolled_at) && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1, ml: { xs: 0, sm: 7 } }}>
                {student.course_name && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <SchoolOutlinedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                    <Typography variant="caption" color="text.disabled">
                      {student.course_name}
                    </Typography>
                  </Box>
                )}
                {student.enrolled_at && (
                  <Typography variant="caption" color="text.disabled">
                    Enrolled: {new Date(student.enrolled_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                  </Typography>
                )}
              </Box>
            )}
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
