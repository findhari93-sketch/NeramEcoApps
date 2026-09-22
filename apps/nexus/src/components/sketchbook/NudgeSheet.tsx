'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Checkbox, Drawer, Typography } from '@neram/ui';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { nudgeStudents, type NudgeResponse } from './sketchbook-api';
import type { RhythmStudent } from './RhythmRow';

function firstName(name: string | null): string {
  return (name || '').trim().split(/\s+/)[0] || 'there';
}

function preview(s: RhythmStudent | undefined): string {
  if (!s) return '';
  const d = s.quietDays;
  return `Hi ${firstName(s.name)}, I have not seen a drawing from you in ${d} ${d === 1 ? 'day' : 'days'}. Add one small sketch today, even a rough one.`;
}

/**
 * "Nudge 6 students": confirm who, see the words, send as your own Teams chat.
 *
 * Every student starts ticked, because the teacher already chose the group by
 * pressing its card; unticking is for the one they spoke to this morning. The
 * result says honestly where each message landed, since a chat that did not send
 * and quietly fell back to the bell is not the same as a chat that did.
 */
export default function NudgeSheet({
  open,
  onClose,
  classroomId,
  students,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  classroomId: string;
  students: RhythmStudent[];
  onSent: () => void;
}) {
  const { getTeacherToken } = useNexusAuthContext();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<NudgeResponse | null>(null);

  useEffect(() => {
    if (open) {
      setPicked(new Set(students.map((s) => s.userId)));
      setError('');
      setResult(null);
    }
  }, [open, students]);

  const chosen = useMemo(() => students.filter((s) => picked.has(s.userId)), [students, picked]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await nudgeStudents(getTeacherToken, classroomId, chosen.map((s) => s.userId));
      setResult(r);
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the nudge');
    } finally {
      setBusy(false);
    }
  };

  const bellOnly = result?.results.filter((r) => !r.channel.includes('chat') && r.channel !== 'failed') ?? [];
  const failed = result?.results.filter((r) => r.channel === 'failed') ?? [];

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={busy ? undefined : onClose}
      PaperProps={{
        sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '85dvh', pb: 'calc(12px + env(safe-area-inset-bottom))' },
      }}
    >
      <Box sx={{ px: 2, pt: 1.5 }}>
        <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mb: 1.5 }} aria-hidden />
        <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
          {result ? 'Nudge sent' : `Nudge ${chosen.length} ${chosen.length === 1 ? 'student' : 'students'}`}
        </Typography>
      </Box>

      {result ? (
        <Box sx={{ px: 2, pt: 1 }} role="status">
          <Typography sx={{ mb: 1 }}>
            {result.counts.chat} in your Teams chat{bellOnly.length ? `, ${bellOnly.length} on the Nexus bell only` : ''}
            {failed.length ? `, ${failed.length} not reached` : ''}.
          </Typography>
          {[...bellOnly, ...failed].map((r) => (
            <Typography key={r.studentId} variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              {r.name || 'Student'}: {r.reasons?.chat || r.reasons?.teams || 'no Teams channel reached'}
            </Typography>
          ))}
          <Button fullWidth variant="contained" onClick={onClose} sx={{ minHeight: 48, mt: 1.5 }}>
            Done
          </Button>
        </Box>
      ) : (
        <>
          <Box sx={{ px: 2, pt: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Sent as your own Teams chat, plus their Nexus bell. Each student sees their own name and days.
            </Typography>
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover', mb: 1 }}>
              <Typography variant="body2">{preview(chosen[0] || students[0])}</Typography>
            </Box>
          </Box>
          <Box role="group" aria-label="Students to nudge" sx={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {students.map((s) => {
              const checked = picked.has(s.userId);
              return (
                <Box
                  component="label"
                  key={s.userId}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 52, px: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <Checkbox checked={checked} onChange={() => toggle(s.userId)} sx={{ width: 44, height: 44 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography noWrap sx={{ fontWeight: 600 }}>{s.name || 'Student'}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {s.label}
                      {/* Every reminder this quiet stretch, not only the automatic ones: a teacher's
                          own earlier nudge is exactly what the next teacher needs to see. */}
                      {s.remindersSentThisCycle > 0
                        ? `, reminded ${s.remindersSentThisCycle === 1 ? 'once' : `${s.remindersSentThisCycle} times`}`
                        : ', not reminded yet'}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
          <Box sx={{ px: 2, pt: 1 }}>
            {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button onClick={onClose} disabled={busy} sx={{ minHeight: 48, flex: 1 }}>
                Cancel
              </Button>
              <Button
                variant="contained"
                startIcon={<SendOutlinedIcon />}
                onClick={send}
                disabled={busy || chosen.length === 0}
                sx={{ minHeight: 48, flex: 2 }}
              >
                {busy ? 'Sending...' : `Send to ${chosen.length}`}
              </Button>
            </Box>
          </Box>
        </>
      )}
    </Drawer>
  );
}
