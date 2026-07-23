'use client';

/**
 * What the class turned out to be, filled in after it happened.
 *
 * A class is often scheduled before anyone knows what it will cover, so it goes
 * into the calendar as "Class by Ar Hari Babu" and stays that way. This is
 * where it gets a real name, a short brief, the subject it belonged to, and the
 * recording, so the same class can be found again months later.
 *
 * Appears only once the class has ended: before that it would just be a second,
 * worse way to edit a class that has its own edit dialog.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Link as MuiLink,
  MenuItem,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { ClassCardData } from './ClassCard';
import { RADIUS } from './timetable-theme';

interface TagOption {
  id: string;
  slug: string;
  label: string;
  group_type: string;
  color: string | null;
}

interface TopicOption {
  id: string;
  title: string;
  category: string | null;
}

interface WrapUpSectionProps {
  cls: ClassCardData;
  getToken: () => Promise<string | null>;
  onSaved: () => void;
  onNotify: (message: string, severity?: 'success' | 'error') => void;
}

export default function WrapUpSection({ cls, getToken, onSaved, onNotify }: WrapUpSectionProps) {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [topicId, setTopicId] = useState('');
  const [recordingUrl, setRecordingUrl] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [available, setAvailable] = useState<TagOption[]>([]);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [planEntryId, setPlanEntryId] = useState<string | null>(null);

  const classId = cls.id;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/timetable/${classId}/wrap-up`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setTitle(data.class?.title || '');
      setBrief(data.class?.description || '');
      setTopicId(data.class?.topic_id || '');
      setRecordingUrl(data.class?.recording_url || '');
      setYoutubeUrl(data.class?.youtube_url || '');
      setPlanEntryId(data.class?.plan_entry_id || null);
      setTagIds((data.tags || []).map((t: TagOption) => t.id));
      setAvailable(data.availableTags || []);
      setTopics(data.topics || []);
    } catch {
      /* the fields simply stay empty */
    } finally {
      setLoading(false);
    }
  }, [classId, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/timetable/${classId}/wrap-up`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title,
          description: brief,
          topic_id: topicId || null,
          tag_ids: tagIds,
          recording_url: recordingUrl,
          youtube_url: youtubeUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onNotify('Class wrapped up');
        onSaved();
      } else {
        onNotify(data.error || 'Could not save the class', 'error');
      }
    } catch {
      onNotify('Could not save the class', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
        <CircularProgress size={20} />
      </Box>
    );
  }

  const bySubject = available.filter((t) => t.group_type === 'subject');
  const byTheme = available.filter((t) => t.group_type === 'theme');

  const toggleTag = (id: string) =>
    setTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));

  const tagRow = (label: string, options: TagOption[]) =>
    options.length > 0 && (
      <Box sx={{ mt: 1.25 }}>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 0.625 }}>
          {label}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.625, flexWrap: 'wrap' }}>
          {options.map((t) => {
            const on = tagIds.includes(t.id);
            return (
              <Chip
                key={t.id}
                label={t.label}
                size="small"
                onClick={() => toggleTag(t.id)}
                sx={{
                  height: 30,
                  fontWeight: on ? 700 : 500,
                  cursor: 'pointer',
                  bgcolor: on ? alpha(theme.palette.primary.main, 0.14) : 'transparent',
                  color: on ? 'primary.dark' : 'text.secondary',
                  border: `1px solid ${on ? theme.palette.primary.main : theme.palette.divider}`,
                }}
              />
            );
          })}
        </Box>
      </Box>
    );

  return (
    <Box>
      <TextField
        label="What was this class?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        fullWidth
        size="small"
        placeholder="Aptitude, perspective basics"
        sx={{ mb: 1.25 }}
      />

      <TextField
        label="Short brief"
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        fullWidth
        size="small"
        multiline
        minRows={2}
        placeholder="What was taken, in a line or two."
        sx={{ mb: 1.25 }}
      />

      {topics.length > 0 && (
        <TextField
          select
          label="Topic"
          value={topicId}
          onChange={(e) => setTopicId(e.target.value)}
          fullWidth
          size="small"
          sx={{ mb: 1.25 }}
        >
          <MenuItem value="">Not linked to a topic</MenuItem>
          {topics.map((t) => (
            <MenuItem key={t.id} value={t.id}>
              {t.title}
            </MenuItem>
          ))}
        </TextField>
      )}

      {/* The same tags questions use, so recordings can be filtered by them. */}
      {tagRow('Subject', bySubject)}
      {tagRow('Theme', byTheme)}

      <Box sx={{ mt: 1.75 }}>
        <TextField
          label="Teams recording link"
          value={recordingUrl}
          onChange={(e) => setRecordingUrl(e.target.value)}
          fullWidth
          size="small"
          placeholder="https://teams.microsoft.com/l/meetingrecap?..."
          sx={{ mb: 1.25 }}
        />
        <TextField
          label="YouTube backup (unlisted)"
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          fullWidth
          size="small"
          placeholder="https://youtu.be/..."
          helperText="Teams recordings expire after about 6 months. The unlisted YouTube copy is the durable one."
        />
      </Box>

      <Button
        variant="contained"
        onClick={save}
        disabled={saving || !title.trim()}
        fullWidth
        sx={{ mt: 1.75, textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control, fontWeight: 700 }}
      >
        {saving ? 'Saving...' : 'Save'}
      </Button>

      {/* When the class belongs to a plan entry, the Class Day screen already
          does coverage logging properly. Point at it rather than build a
          second, weaker version here. */}
      {planEntryId && (
        <MuiLink
          href={`/teacher/course-plans?class=${classId}`}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            mt: 1.25,
            fontSize: '0.75rem',
            fontWeight: 600,
          }}
        >
          Log what was covered on Class Day
          <OpenInNewIcon sx={{ fontSize: 13 }} />
        </MuiLink>
      )}
    </Box>
  );
}
