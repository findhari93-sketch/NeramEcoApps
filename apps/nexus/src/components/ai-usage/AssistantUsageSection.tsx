'use client';

import { useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Divider, Paper, Skeleton, Stack, TextField, Typography } from '@neram/ui';
import { useAuthSWR } from '@/lib/nexus-swr';
import StudentAvatar from '@/components/students/StudentAvatar';

/**
 * Neram Assistant block of the AI usage page: the daily allowance of AI
 * questions, who used them this month and at what cost, and the teacher
 * overrides in force. Stacked rows rather than tables, so it reads on a phone.
 */

interface StudentRow { studentId: string; name: string | null; questions: number; costUsd: number; access: string }
interface OverrideItem { studentId: string; studentName: string | null; mode: 'on' | 'off'; reason: string; setByName: string | null; setAt: string; endsOn: string | null }
interface AssistantUsage { dailyLimit: number; students: StudentRow[]; overrides: OverrideItem[] }

// Same rupee format as the page's own inr().
function inr(n: number, rate: number): string {
  const value = n * rate;
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: value < 100 ? 2 : 0 })}`;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

export default function AssistantUsageSection({ rate, getToken }: { rate: number; getToken: () => Promise<string | null | undefined> }) {
  const { data, error, isLoading, mutate } = useAuthSWR<AssistantUsage>('/api/admin/ai-usage/assistant');
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const shown = draft ?? (data ? String(data.dailyLimit) : '');
  const n = Number(shown);
  const valid = shown.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 50;
  const dirty = data !== undefined && draft !== null && draft !== String(data.dailyLimit);

  async function save() {
    if (!valid) return;
    setSaving(true);
    setMessage(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/ai-usage/assistant', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ dailyLimit: n }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not save. Please try again.');
      setDraft(null);
      setMessage({ type: 'success', text: `Saved. Each student now gets ${body.dailyLimit} AI questions a day.` });
      mutate();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not save. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2, mt: 3 }} component="section" aria-labelledby="assistant-usage-title">
      <Typography id="assistant-usage-title" variant="h6" component="h2" sx={{ fontWeight: 700 }}>
        Neram Assistant
      </Typography>

      {error && !data && (
        <Alert severity="error" sx={{ mt: 2 }}>Could not load the Assistant usage. Please refresh the page.</Alert>
      )}

      <Box sx={{ mt: 2 }}>
        <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 700 }}>AI questions per student per day</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 1, alignItems: { sm: 'flex-start' } }}>
          <TextField
            type="number"
            value={shown}
            onChange={(e) => { setDraft(e.target.value); setMessage(null); }}
            disabled={!data || saving}
            error={shown !== '' && !valid}
            helperText={shown !== '' && !valid ? 'Enter a whole number from 0 to 50.' : '0 pauses AI answers for every student. The free assistant features keep working.'}
            inputProps={{ min: 0, max: 50, step: 1, inputMode: 'numeric', 'aria-label': 'AI questions per student per day' }}
            sx={{ width: { xs: '100%', sm: 220 }, '& .MuiInputBase-root': { minHeight: 48 } }}
          />
          <Button
            variant="contained"
            onClick={save}
            disabled={!dirty || !valid || saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, minHeight: 48, px: 3, width: { xs: '100%', sm: 'auto' } }}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </Stack>
        <Box aria-live="polite">
          {message && <Alert severity={message.type} sx={{ mt: 1.5 }}>{message.text}</Alert>}
        </Box>
      </Box>

      <Divider sx={{ my: 2.5 }} />

      <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 700 }}>This month</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Top 50 students by cost this month.</Typography>
      {isLoading && !data ? (
        <Stack spacing={1} sx={{ mt: 1 }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={64} />)}
        </Stack>
      ) : data && data.students.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No student has used AI answers this month.</Typography>
      ) : (
        <Stack divider={<Divider flexItem />} sx={{ mt: 1 }} component="ul" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {(data?.students ?? []).map((s) => (
            <Box component="li" key={s.studentId} sx={{ py: 1.25, display: 'flex', gap: 2, justifyContent: 'space-between', alignItems: 'flex-start', minHeight: 48 }}>
              <Box sx={{ minWidth: 0, display: 'flex', gap: 1.5, alignItems: 'center' }}>
                <StudentAvatar userId={s.studentId} name={s.name} size={32} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{s.name || 'Unnamed student'}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>{s.access}</Typography>
                </Box>
              </Box>
              <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{inr(s.costUsd, rate)}</Typography>
                <Typography variant="caption" color="text.secondary">{s.questions} {s.questions === 1 ? 'question' : 'questions'}</Typography>
              </Box>
            </Box>
          ))}
        </Stack>
      )}

      <Divider sx={{ my: 2.5 }} />

      <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 700 }}>Teacher overrides</Typography>
      {data && data.overrides.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No overrides.</Typography>
      ) : (
        <Stack divider={<Divider flexItem />} sx={{ mt: 1 }} component="ul" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {(data?.overrides ?? []).map((o) => (
            <Box component="li" key={`${o.studentId}-${o.setAt}`} sx={{ py: 1.25, minHeight: 48 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                <StudentAvatar userId={o.studentId} name={o.studentName} size={32} />
                <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{o.studentName || 'Unnamed student'}</Typography>
                <Chip size="small" label={o.mode === 'on' ? 'Always on' : 'Always off'} color={o.mode === 'on' ? 'success' : 'default'} variant="outlined" />
              </Stack>
              {o.reason && <Typography variant="body2" sx={{ mt: 0.25, overflowWrap: 'anywhere' }}>{o.reason}</Typography>}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {o.setByName ? `Set by ${o.setByName}` : 'Set by a teacher'}
                {o.setAt ? ` on ${shortDate(o.setAt)}` : ''}
                {o.endsOn ? `, until ${shortDate(`${o.endsOn}T00:00:00+05:30`)}` : ', no end date'}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
    </Paper>
  );
}
