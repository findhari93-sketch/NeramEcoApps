'use client';

import { Box, Chip, Paper, Typography } from '@neram/ui';
import HistoryIcon from '@mui/icons-material/History';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import type { UserProfileHistory, User } from '@neram/database';

interface HistoryTimelineProps {
  history: (UserProfileHistory & { changed_by_user?: Pick<User, 'id' | 'name' | 'email'> })[];
}

const SOURCE_CONFIG: Record<string, { color: string; label: string; bgColor: string }> = {
  user: { color: '#1565C0', label: 'User', bgColor: '#1565C014' },
  admin: { color: '#E65100', label: 'Admin', bgColor: '#E6510014' },
  system: { color: '#616161', label: 'System', bgColor: '#61616114' },
};

function formatValue(val: string | null): string {
  if (!val) return 'empty';
  try {
    const parsed = JSON.parse(val);
    if (typeof parsed === 'string') return parsed;
    return JSON.stringify(parsed);
  } catch {
    return val;
  }
}

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function HistoryTimeline({ history }: HistoryTimelineProps) {
  return (
    <Paper
      elevation={0}
      sx={{ mb: 3, border: '1px solid', borderColor: 'grey.200', borderRadius: 2, overflow: 'hidden' }}
    >
      <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: 'grey.100', bgcolor: 'grey.50' }}>
        <HistoryIcon sx={{ color: 'primary.main', fontSize: 20 }} />
        <Typography variant="subtitle1" fontWeight={700}>Change History</Typography>
        <Chip label={history.length} size="small" sx={{ height: 20, fontSize: 10, fontWeight: 700, bgcolor: 'grey.200', color: 'text.secondary', borderRadius: 1, ml: 0.5 }} />
      </Box>

      <Box sx={{ p: 2.5 }}>
        {history.length === 0 ? (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <HistoryIcon sx={{ fontSize: 32, color: 'grey.300', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">No changes recorded yet.</Typography>
          </Box>
        ) : (
          <Box sx={{ position: 'relative' }}>
            <Box sx={{ position: 'absolute', left: 9, top: 12, bottom: 12, width: 1.5, bgcolor: 'grey.200' }} />

            {history.map((entry, index) => {
              const sourceConfig = SOURCE_CONFIG[entry.change_source] || SOURCE_CONFIG.system;
              return (
                <Box key={entry.id} sx={{ display: 'flex', gap: 2, mb: index < history.length - 1 ? 2 : 0, position: 'relative' }}>
                  <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: sourceConfig.color, flexShrink: 0, mt: 0.25, zIndex: 1, border: '3px solid', borderColor: 'background.paper', boxShadow: `0 0 0 1px ${sourceConfig.color}40` }} />
                  <Box sx={{ flex: 1, minWidth: 0, p: 1.5, borderRadius: 2, bgcolor: 'grey.50', border: '1px solid', borderColor: 'grey.100' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 12.5 }}>
                        {entry.field_name.replace(/_/g, ' ').replace('lead profile.', '')}
                      </Typography>
                      <Chip label={sourceConfig.label} size="small" sx={{ height: 18, fontSize: 9, fontWeight: 700, bgcolor: sourceConfig.bgColor, color: sourceConfig.color, borderRadius: 1, letterSpacing: 0.5 }} />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.disabled', textDecoration: 'line-through', fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {formatValue(entry.old_value)}
                      </Typography>
                      <ArrowForwardIcon sx={{ fontSize: 10, color: 'text.disabled' }} />
                      <Typography variant="caption" sx={{ fontWeight: 600, fontSize: 11, color: 'text.primary', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {formatValue(entry.new_value)}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10.5 }}>
                      {formatTimestamp(entry.created_at)}
                      {entry.changed_by_user?.name && <span style={{ fontWeight: 500 }}> by {entry.changed_by_user.name}</span>}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </Paper>
  );
}
