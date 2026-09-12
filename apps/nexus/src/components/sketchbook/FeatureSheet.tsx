'use client';

import { useEffect, useState } from 'react';
import {
  Box, Button, Drawer, FormControl, InputLabel, MenuItem, Select, TextField, Typography, Alert,
} from '@neram/ui';
import type { SketchbookFeatureFact } from '@neram/database/queries/nexus';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { featureSketch } from './sketchbook-api';

interface FeatureSheetProps {
  open: boolean;
  onClose: () => void;
  sketchId: string;
  defaultCaption: string;
  onFeatured: (fact: SketchbookFeatureFact) => void;
}

/**
 * Bottom sheet: pick the classroom, edit the caption, confirm. The server
 * re-checks that both teacher and student are in the classroom, so the list
 * here is only the teacher's own classrooms and a wrong pick reads as a clear
 * error rather than a silent post.
 */
export default function FeatureSheet({ open, onClose, sketchId, defaultCaption, onFeatured }: FeatureSheetProps) {
  const { getToken, classrooms, activeClassroom, impersonation } = useNexusAuthContext();
  const [classroomId, setClassroomId] = useState(activeClassroom?.id ?? classrooms[0]?.id ?? '');
  const [caption, setCaption] = useState(defaultCaption);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ channel: boolean; chat: boolean; errors: string[] } | null>(null);

  useEffect(() => { if (open) { setCaption(defaultCaption); setError(''); setResult(null); } }, [open, defaultCaption]);

  const blocked = impersonation ? 'Featuring posts to Teams from your own Microsoft account, so it is off while viewing as a student.' : '';

  return (
    <Drawer anchor="bottom" open={open} onClose={busy ? undefined : onClose}
      PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, p: 2, pb: 'calc(16px + env(safe-area-inset-bottom))', maxHeight: '85vh' } }}>
      <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mb: 2 }} aria-hidden />
      <Typography variant="h6" sx={{ mb: 0.5 }}>Feature to class</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Posts to the class group chat and channel, and tells the student.
      </Typography>

      {blocked && <Alert severity="info" sx={{ mb: 2 }}>{blocked}</Alert>}

      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel id="feature-classroom">Classroom</InputLabel>
        <Select labelId="feature-classroom" label="Classroom" value={classroomId} onChange={(e) => setClassroomId(String(e.target.value))} sx={{ minHeight: 48 }}>
          {classrooms.map((c) => <MenuItem key={c.id} value={c.id} sx={{ minHeight: 48 }}>{c.name}</MenuItem>)}
        </Select>
      </FormControl>

      <TextField label="Caption" value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 120))} fullWidth multiline rows={2}
        helperText={`${caption.length}/120. Shown under the sketch in Teams.`} sx={{ mb: 2 }} />

      {result && (
        <Alert severity={result.errors.length ? 'warning' : 'success'} sx={{ mb: 2 }}>
          {result.channel || result.chat ? `Posted to ${[result.channel && 'the channel', result.chat && 'the group chat'].filter(Boolean).join(' and ')}.` : 'Featured in Nexus.'}
          {result.errors.length > 0 && ` Teams said: ${result.errors.join('; ')}`}
        </Alert>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button onClick={onClose} disabled={busy} sx={{ minHeight: 48 }}>{result ? 'Done' : 'Cancel'}</Button>
        {!result && (
          <Button variant="contained" disabled={busy || !classroomId || !!blocked} sx={{ minHeight: 48 }}
            onClick={async () => {
              setBusy(true); setError('');
              try {
                const r = await featureSketch(getToken, sketchId, classroomId, caption.trim());
                setResult(r.teams);
                onFeatured({
                  classroom_id: classroomId,
                  classroom_name: classrooms.find((c) => c.id === classroomId)?.name ?? '',
                  featured_at: new Date().toISOString(),
                });
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not feature the sketch');
              } finally { setBusy(false); }
            }}>
            {busy ? 'Posting...' : 'Feature to class'}
          </Button>
        )}
      </Box>
    </Drawer>
  );
}
