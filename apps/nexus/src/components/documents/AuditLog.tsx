'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  alpha,
  useTheme,
} from '@neram/ui';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface AuditEntry {
  id: string;
  document_id: string | null;
  student_id: string;
  classroom_id: string;
  action: string;
  performed_by: string;
  performer: { id: string; name: string } | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const ACTION_COLORS: Record<string, 'success' | 'error' | 'info' | 'warning' | 'default'> = {
  uploaded: 'info',
  verified: 'success',
  rejected: 'error',
  re_uploaded: 'warning',
  soft_deleted: 'default',
  hard_deleted: 'error',
  restored: 'success',
};

export default function AuditLog({ studentId }: { studentId?: string }) {
  const theme = useTheme();
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAudit = useCallback(async () => {
    if (!activeClassroom) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const params = new URLSearchParams({ classroom: activeClassroom.id });
      if (studentId) params.set('student', studentId);
      const res = await fetch(`/api/documents/audit?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch (err) {
      console.error('Failed to load audit log:', err);
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, getToken, studentId]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rectangular" height={56} sx={{ borderRadius: 1 }} />
        ))}
      </Box>
    );
  }

  if (entries.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <HistoryOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
        <Typography color="text.secondary">No activity yet.</Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {entries.map((entry) => (
        <Paper
          key={entry.id}
          variant="outlined"
          sx={{
            p: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: `${ACTION_COLORS[entry.action] || 'default'}.main`,
              flexShrink: 0,
            }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={500}>
              {entry.performer?.name || 'Unknown'}{' '}
              <Chip
                label={entry.action.replace(/_/g, ' ')}
                size="small"
                color={ACTION_COLORS[entry.action] || 'default'}
                sx={{ height: 20, fontSize: '0.65rem', mx: 0.5, textTransform: 'capitalize' }}
              />
              {(entry.metadata as Record<string, unknown>)?.title && (
                <Typography component="span" variant="body2" color="text.secondary">
                  &quot;{String((entry.metadata as Record<string, unknown>).title)}&quot;
                </Typography>
              )}
            </Typography>
            <Typography variant="caption" color="text.disabled">
              {new Date(entry.created_at).toLocaleString()}
            </Typography>
          </Box>
        </Paper>
      ))}
    </Box>
  );
}
