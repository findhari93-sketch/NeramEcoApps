'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Chip,
  Skeleton,
  Button,
  Paper,
  alpha,
  useTheme,
} from '@neram/ui';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface Student {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  current_standard: string | null;
}

interface Template {
  id: string;
  name: string;
  category: string;
  is_required: boolean;
}

interface MatrixCell {
  status: string;
  document_id: string;
}

export default function ClassDocumentMatrix() {
  const theme = useTheme();
  const router = useRouter();
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [students, setStudents] = useState<Student[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [matrix, setMatrix] = useState<Record<string, Record<string, MatrixCell | null>>>({});
  const [loading, setLoading] = useState(true);

  const fetchOverview = useCallback(async () => {
    if (!activeClassroom) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/documents/class-overview?classroom=${activeClassroom.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStudents(data.students || []);
        setTemplates(data.templates || []);
        setMatrix(data.matrix || {});
      }
    } catch (err) {
      console.error('Failed to load overview:', err);
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, getToken]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const statusColor = (status: string | null) => {
    if (!status) return { bg: theme.palette.grey[100], text: theme.palette.grey[500], label: 'Missing' };
    if (status === 'verified') return { bg: alpha(theme.palette.success.main, 0.1), text: theme.palette.success.main, label: 'Verified' };
    if (status === 'rejected') return { bg: alpha(theme.palette.error.main, 0.1), text: theme.palette.error.main, label: 'Rejected' };
    return { bg: alpha(theme.palette.warning.main, 0.1), text: theme.palette.warning.main, label: 'Pending' };
  };

  const exportCSV = () => {
    const headers = ['Student', 'Email', ...templates.map((t) => t.name)];
    const rows = students.map((s) => [
      s.name,
      s.email,
      ...templates.map((t) => {
        const cell = matrix[s.id]?.[t.id];
        return cell ? cell.status : 'missing';
      }),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `document-overview-${activeClassroom?.name || 'classroom'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rectangular" height={48} sx={{ borderRadius: 1 }} />
        ))}
      </Box>
    );
  }

  if (students.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <DescriptionOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
        <Typography color="text.secondary">No students enrolled in this classroom.</Typography>
      </Paper>
    );
  }

  if (templates.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <DescriptionOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
        <Typography color="text.secondary">No document templates created yet.</Typography>
        <Typography variant="caption" color="text.disabled">Go to the Templates tab to create document templates.</Typography>
      </Paper>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>
        <Button
          size="small"
          startIcon={<DownloadOutlinedIcon />}
          onClick={exportCSV}
          sx={{ textTransform: 'none' }}
        >
          Export CSV
        </Button>
      </Box>

      <Box
        sx={{
          overflow: 'auto',
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 2,
        }}
      >
        <table
          style={{
            borderCollapse: 'collapse',
            minWidth: '100%',
            fontSize: '0.8125rem',
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                  background: theme.palette.background.paper,
                  padding: '10px 14px',
                  textAlign: 'left',
                  borderBottom: `2px solid ${theme.palette.divider}`,
                  borderRight: `1px solid ${theme.palette.divider}`,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  minWidth: 160,
                }}
              >
                Student
              </th>
              {templates.map((t) => (
                <th
                  key={t.id}
                  style={{
                    padding: '10px 12px',
                    textAlign: 'center',
                    borderBottom: `2px solid ${theme.palette.divider}`,
                    borderRight: `1px solid ${theme.palette.divider}`,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    minWidth: 100,
                  }}
                >
                  {t.name}
                  {t.is_required && (
                    <span style={{ color: theme.palette.error.main, marginLeft: 2 }}>*</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr
                key={s.id}
                style={{ cursor: 'pointer' }}
                onClick={() => router.push(`/teacher/documents/student/${s.id}`)}
              >
                <td
                  style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 1,
                    background: theme.palette.background.paper,
                    padding: '10px 14px',
                    borderBottom: `1px solid ${theme.palette.divider}`,
                    borderRight: `1px solid ${theme.palette.divider}`,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.name}
                </td>
                {templates.map((t) => {
                  const cell = matrix[s.id]?.[t.id];
                  const { bg, text, label } = statusColor(cell?.status || null);
                  return (
                    <td
                      key={t.id}
                      style={{
                        padding: '8px 12px',
                        textAlign: 'center',
                        borderBottom: `1px solid ${theme.palette.divider}`,
                        borderRight: `1px solid ${theme.palette.divider}`,
                      }}
                    >
                      <Chip
                        label={label}
                        size="small"
                        sx={{
                          bgcolor: bg,
                          color: text,
                          fontWeight: 600,
                          fontSize: '0.7rem',
                          height: 24,
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </Box>
  );
}
