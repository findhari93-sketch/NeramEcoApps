'use client';

import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Chip, Stack, Typography, alpha, useTheme } from '@neram/ui';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';

interface Escalation {
  id: string;
  student_id: string;
  student_name: string;
  label: string;
  notes: string[];
  status: string;
  parent_notified_at: string | null;
}

interface PreworkEscalationCardProps {
  classroomId: string;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  onNotify?: (message: string, severity?: 'success' | 'error' | 'warning') => void;
}

/**
 * "Pre-class work: needs a word".
 *
 * The queue the afternoon sweep fills in and a teacher empties. Deliberately
 * lives on the existing assignments overview rather than a page of its own: that
 * screen already owns the classroom picker, the roster and the messaging dialog,
 * and a fourth place to look is a place that stops being looked at.
 *
 * Renders nothing at all when the queue is empty. A zero-state card for a
 * problem nobody has is just a permanent bit of guilt on the page.
 */
export default function PreworkEscalationCard({
  classroomId,
  authFetch,
  onNotify,
}: PreworkEscalationCardProps) {
  const theme = useTheme();
  const [rows, setRows] = useState<Escalation[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!classroomId) return;
    try {
      const res = await authFetch(`/api/timetable/prework-escalations?classroom=${classroomId}`);
      setRows(res.escalations || []);
    } catch {
      /* an empty queue and a failed fetch look the same here, deliberately */
    }
  }, [authFetch, classroomId]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: string, action: 'notify_parent' | 'dismiss') => {
    setBusyId(id);
    try {
      const res = await authFetch('/api/timetable/prework-escalations', {
        method: 'POST',
        body: JSON.stringify({ escalation_id: id, action }),
      });
      setRows((prev) => prev.filter((r) => r.id !== id));
      if (action === 'notify_parent') {
        onNotify?.(res.message || 'Sent.', res.delivered ? 'success' : 'warning');
      }
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Could not update that case.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (!rows.length) return null;

  return (
    <Box
      sx={{
        mb: 2,
        p: { xs: 1.5, sm: 2 },
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'warning.main',
        bgcolor: alpha(theme.palette.warning.main, 0.06),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <ReportProblemOutlinedIcon sx={{ fontSize: 20, color: 'warning.dark' }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
          Pre-class work: needs a word
        </Typography>
      </Box>

      <Stack spacing={1.5}>
        {rows.map((r) => (
          <Box
            key={r.id}
            sx={{
              p: 1.5,
              borderRadius: 1.5,
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {r.student_name}
            </Typography>
            <Stack direction="row" spacing={0.75} sx={{ mt: 0.5, mb: 1.25, flexWrap: 'wrap' }} useFlexGap>
              <Chip size="small" label={r.label} color="warning" variant="outlined" />
              {r.notes.map((n) => (
                <Chip key={n} size="small" label={n} variant="outlined" />
              ))}
            </Stack>
            {/* Both actions are first class. "Not now" exists so a teacher who
                knows the context (a bereavement, an exam week) can close the case
                without it reading as ignoring a warning. */}
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                color="warning"
                size="small"
                disabled={busyId === r.id}
                onClick={() => act(r.id, 'notify_parent')}
                sx={{ textTransform: 'none', fontWeight: 700, minHeight: 44 }}
              >
                Notify parent
              </Button>
              <Button
                size="small"
                disabled={busyId === r.id}
                onClick={() => act(r.id, 'dismiss')}
                sx={{ textTransform: 'none', minHeight: 44 }}
              >
                Not now
              </Button>
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
