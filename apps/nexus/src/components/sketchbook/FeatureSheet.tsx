'use client';

import { useEffect, useState } from 'react';
import {
  Box, Button, Drawer, FormControl, InputLabel, MenuItem, Select, Typography, Alert,
} from '@neram/ui';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import CollectionsOutlinedIcon from '@mui/icons-material/CollectionsOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import type { SketchbookFeatureFact } from '@neram/database/queries/nexus';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { firstName } from '@/lib/sketchbook-messages';
import { featureSketch } from './sketchbook-api';

interface FeatureSheetProps {
  open: boolean;
  onClose: () => void;
  sketchId: string;
  /** Used only to say whose work it is. Absent reads as "the student". */
  studentName?: string | null;
  onFeatured: (fact: SketchbookFeatureFact) => void;
}

/**
 * Confirm, and nothing else.
 *
 * This used to be a form: pick a classroom, write a caption. Both questions were
 * unanswerable in practice. There is one real teaching classroom, so the picker
 * had one meaningful option, and a caption has no right answer, which turned a
 * routine act of praise into a writing task and stopped it happening at all.
 *
 * The server resolves the classroom from the one this teacher and this student
 * share, and writes the words. So the sheet's whole job is to say what is about
 * to happen in three lines and take one tap. The drawing itself is already on
 * screen behind the sheet, so it is not repeated here.
 *
 * The rare teacher who shares two classrooms with a student gets a 409 and only
 * then is asked, from the list this component already holds.
 */
export default function FeatureSheet({ open, onClose, sketchId, studentName, onFeatured }: FeatureSheetProps) {
  const { getToken, classrooms, impersonation } = useNexusAuthContext();
  const [classroomId, setClassroomId] = useState('');
  const [mustChoose, setMustChoose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ channel: boolean; chat: boolean; errors: string[]; shelved: boolean } | null>(null);

  useEffect(() => {
    if (open) { setError(''); setResult(null); setMustChoose(false); setClassroomId(''); }
  }, [open]);

  const blocked = impersonation ? 'Featuring posts to Teams from your own Microsoft account, so it is off while viewing as a student.' : '';
  const who = firstName(studentName) === 'Your teacher' ? 'The student' : firstName(studentName);
  // Name the classroom only when there is no doubt which one the server will pick.
  const where = classrooms.length === 1 ? classrooms[0].name : 'your class';

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const r = await featureSketch(getToken, sketchId, classroomId || undefined);
      setResult({ ...r.teams, shelved: r.shelved });
      onFeatured({
        classroom_id: r.feature.classroom_id,
        classroom_name: classrooms.find((c) => c.id === r.feature.classroom_id)?.name ?? '',
        featured_at: r.feature.featured_at,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not feature this work';
      // The one case worth asking about, and only once it has actually happened.
      if (/more than one classroom/i.test(message)) setMustChoose(true);
      setError(message);
    } finally { setBusy(false); }
  };

  return (
    <Drawer anchor="bottom" open={open} onClose={busy ? undefined : onClose}
      PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, p: 2, pb: 'calc(16px + env(safe-area-inset-bottom))', maxHeight: '85vh' } }}>
      <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mb: 2 }} aria-hidden />
      <Typography variant="h6" sx={{ mb: 0.5 }}>Feature this work</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {result ? 'Here is what happened.' : 'One tap. Nothing to fill in.'}
      </Typography>

      {blocked && <Alert severity="info" sx={{ mb: 2 }}>{blocked}</Alert>}

      {!result && (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, mb: 2, p: 0, display: 'grid', gap: 1.5 }}>
          <Outcome icon={<GroupsOutlinedIcon fontSize="small" />} text={`Posted to ${where} on Teams`} />
          <Outcome icon={<CollectionsOutlinedIcon fontSize="small" />} text="Added to Inspiration, where every student can find it" />
          <Outcome icon={<NotificationsActiveOutlinedIcon fontSize="small" />} text={`${who} is told, in Teams and in Nexus`} />
        </Box>
      )}

      {mustChoose && !result && (
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel id="feature-classroom">Classroom</InputLabel>
          <Select labelId="feature-classroom" label="Classroom" value={classroomId}
            onChange={(e) => setClassroomId(String(e.target.value))} sx={{ minHeight: 48 }}>
            {classrooms.map((c) => <MenuItem key={c.id} value={c.id} sx={{ minHeight: 48 }}>{c.name}</MenuItem>)}
          </Select>
        </FormControl>
      )}

      {result && (
        <Alert severity={result.errors.length ? 'warning' : 'success'} sx={{ mb: 2 }}>
          {result.channel || result.chat
            ? `Posted to ${[result.channel && 'the channel', result.chat && 'the group chat'].filter(Boolean).join(' and ')}.`
            : 'Featured in Nexus.'}
          {result.shelved
            ? ' It is on the Inspiration shelf now.'
            : ' It is not on the Inspiration shelf, because this student keeps their drawings out of it.'}
          {result.errors.length > 0 && ` Teams said: ${result.errors.join('; ')}`}
        </Alert>
      )}
      {error && !mustChoose && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {error && mustChoose && <Alert severity="info" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button onClick={onClose} disabled={busy} sx={{ minHeight: 48 }}>{result ? 'Done' : 'Cancel'}</Button>
        {!result && (
          <Button variant="contained" disabled={busy || !!blocked || (mustChoose && !classroomId)} sx={{ minHeight: 48 }} onClick={submit}>
            {busy ? 'Featuring...' : 'Feature this work'}
          </Button>
        )}
      </Box>
    </Drawer>
  );
}

function Outcome({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <Box component="li" sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
      <Box aria-hidden sx={{ color: 'text.secondary', display: 'flex', pt: '2px' }}>{icon}</Box>
      <Typography variant="body2">{text}</Typography>
    </Box>
  );
}
