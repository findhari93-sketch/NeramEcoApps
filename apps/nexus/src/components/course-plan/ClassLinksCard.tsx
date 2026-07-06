'use client';

/**
 * Class Day card for attaching the recording links to a class that has happened.
 * The teacher pastes the Teams recording link and the unlisted-YouTube backup
 * (Teams copies expire in ~6 months). Students never see these links directly:
 * the only way they watch is the gated "guided recap", so this card also lets
 * the teacher spin up that recap in one tap.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, Stack, Chip, Button, TextField, alpha } from '@neram/ui';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import SmartDisplayOutlinedIcon from '@mui/icons-material/SmartDisplayOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { ClassLinks } from './common';

interface ClassLinksCardProps {
  classLinks: ClassLinks;
  recap: { id: string; status: string } | null;
  saving: boolean;
  onSaveLinks: (recordingUrl: string, youtubeUrl: string) => Promise<boolean>;
  onCreateRecap: () => Promise<void>;
  creatingRecap: boolean;
}

export default function ClassLinksCard({
  classLinks,
  recap,
  saving,
  onSaveLinks,
  onCreateRecap,
  creatingRecap,
}: ClassLinksCardProps) {
  const router = useRouter();
  const [recording, setRecording] = useState(classLinks.recording_url || '');
  const [youtube, setYoutube] = useState(classLinks.youtube_url || '');

  useEffect(() => {
    setRecording(classLinks.recording_url || '');
    setYoutube(classLinks.youtube_url || '');
  }, [classLinks.recording_url, classLinks.youtube_url]);

  const dirty =
    recording.trim() !== (classLinks.recording_url || '') ||
    youtube.trim() !== (classLinks.youtube_url || '');

  const recapPublished = recap?.status === 'published';

  return (
    <Box
      sx={{
        mt: 1.5,
        p: 2,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.25 }}>
        <VideocamOutlinedIcon sx={{ fontSize: 20, color: 'primary.main' }} />
        <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>Class recording</Typography>
        {classLinks.recording_url && (
          <Chip label="Teams saved" size="small" color="success" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
        )}
        {classLinks.youtube_url && (
          <Chip label="YouTube backup" size="small" color="error" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
        )}
      </Stack>

      <TextField
        label="Teams recording link"
        value={recording}
        onChange={(e) => setRecording(e.target.value)}
        fullWidth
        size="small"
        placeholder="https://teams.microsoft.com/l/meetingrecap?..."
        sx={{ mb: 1.25 }}
      />
      <TextField
        label="YouTube backup (unlisted)"
        value={youtube}
        onChange={(e) => setYoutube(e.target.value)}
        fullWidth
        size="small"
        placeholder="https://youtu.be/..."
        helperText="Teams recordings expire after ~6 months. The unlisted YouTube copy is the durable one."
        sx={{ mb: 1 }}
      />
      <Button
        variant="contained"
        disabled={!dirty || saving}
        onClick={() => onSaveLinks(recording.trim(), youtube.trim())}
        sx={{ minHeight: 44 }}
      >
        {saving ? 'Saving...' : 'Save links'}
      </Button>

      {/* Guided recap: the only way students watch the class. */}
      <Box
        sx={{
          mt: 1.75,
          pt: 1.5,
          borderTop: '1px dashed',
          borderColor: 'divider',
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
          <SmartDisplayOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Guided recap
          </Typography>
          {recap && (
            <Chip
              label={recapPublished ? 'Published' : 'Draft'}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.65rem',
                fontWeight: 700,
                bgcolor: recapPublished ? alpha('#2E7D32', 0.12) : alpha('#F9A825', 0.18),
                color: recapPublished ? '#1B5E20' : '#8D5A00',
              }}
            />
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Students watch the class through a checkpoint quiz. They must pass each segment to move on.
        </Typography>
        {recap ? (
          <Button
            variant="outlined"
            size="small"
            endIcon={<OpenInNewIcon sx={{ fontSize: 15 }} />}
            onClick={() => router.push(`/teacher/class-recaps/${recap.id}`)}
            sx={{ minHeight: 40 }}
          >
            {recapPublished ? 'Open recap' : 'Finish and publish recap'}
          </Button>
        ) : (
          <Button
            variant="outlined"
            size="small"
            startIcon={<AutoAwesomeOutlinedIcon sx={{ fontSize: 16 }} />}
            disabled={creatingRecap || (!classLinks.recording_url && !classLinks.youtube_url)}
            onClick={onCreateRecap}
            sx={{ minHeight: 40 }}
          >
            {creatingRecap ? 'Creating...' : 'Create guided recap'}
          </Button>
        )}
        {!classLinks.recording_url && !classLinks.youtube_url && (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.75 }}>
            Add a recording link first.
          </Typography>
        )}
      </Box>
    </Box>
  );
}
