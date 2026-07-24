'use client';

/**
 * What the class turned out to be, filled in after it happened.
 *
 * A class is often scheduled before anyone knows what it will cover, so it goes
 * into the calendar as "Class by Ar Hari Babu" and stays that way. This is
 * where it gets a real name, a short brief, a point-by-point record, the subject
 * it belonged to, the drawings done in class, and the recording, so the same
 * class can be found again months later.
 *
 * The teacher can fill it all in by hand, or click Generate: the app reads the
 * class transcript (and any attached drawings) and drafts the title, brief,
 * detailed note, bullet points, and tags for review. Generation runs in-app on
 * the shared AI key; on a busy signal the teacher just types instead.
 *
 * Appears only once the class has ended: before that it would just be a second,
 * worse way to edit a class that has its own edit dialog.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  ImageUploadList,
  InputAdornment,
  Link as MuiLink,
  MenuItem,
  Paper,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import YouTubeIcon from '@mui/icons-material/YouTube';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
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

interface SuggestedTag {
  label: string;
  group_type: string;
  existing_tag_id: string | null;
}

interface ClassImage {
  id: string;
  url: string;
  caption: string | null;
  sort_order: number;
  source: string;
}

interface YtResult {
  id: string;
  title: string;
  thumbnail_url?: string;
  channel_title?: string;
  url?: string;
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
  const [generating, setGenerating] = useState(false);

  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [detailed, setDetailed] = useState('');
  const [showDetailed, setShowDetailed] = useState(false);
  const [bullets, setBullets] = useState<string[]>([]);
  const [topicId, setTopicId] = useState('');
  const [recordingUrl, setRecordingUrl] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [available, setAvailable] = useState<TagOption[]>([]);
  const [suggestedTags, setSuggestedTags] = useState<SuggestedTag[]>([]);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [planEntryId, setPlanEntryId] = useState<string | null>(null);

  const [images, setImages] = useState<ClassImage[]>([]);
  const [pastingDrawing, setPastingDrawing] = useState(false);

  const [needsManual, setNeedsManual] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [transcriptText, setTranscriptText] = useState('');

  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagGroup, setNewTagGroup] = useState<'subject' | 'theme'>('subject');

  const [ytOpen, setYtOpen] = useState(false);
  const [ytQuery, setYtQuery] = useState('');
  const [ytResults, setYtResults] = useState<YtResult[]>([]);
  const [ytSearching, setYtSearching] = useState(false);

  const classId = cls.id;
  const transcriptInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const [wrapRes, imgRes] = await Promise.all([
        fetch(`/api/timetable/${classId}/wrap-up`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/timetable/${classId}/images`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (wrapRes.ok) {
        const data = await wrapRes.json();
        setTitle(data.class?.title || '');
        setBrief(data.class?.description || '');
        setDetailed(data.class?.notes || '');
        setShowDetailed(!!data.class?.notes);
        setBullets(Array.isArray(data.class?.summary_bullets) ? data.class.summary_bullets : []);
        setTopicId(data.class?.topic_id || '');
        setRecordingUrl(data.class?.recording_url || '');
        setYoutubeUrl(data.class?.youtube_url || '');
        setPlanEntryId(data.class?.plan_entry_id || null);
        setTagIds((data.tags || []).map((t: TagOption) => t.id));
        setAvailable(data.availableTags || []);
        setTopics(data.topics || []);
      }
      if (imgRes.ok) {
        const data = await imgRes.json();
        setImages(data.images || []);
      }
    } catch {
      /* the fields simply stay empty */
    } finally {
      setLoading(false);
    }
  }, [classId, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  // --- AI generate ---------------------------------------------------------
  const runGenerate = async (bodyOverride?: Record<string, unknown>) => {
    setGenerating(true);
    try {
      const token = await getToken();
      const payload = bodyOverride ?? (transcriptText.trim() ? { transcript_text: transcriptText.trim() } : {});
      const res = await fetch(`/api/timetable/${classId}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onNotify(data.error || 'Could not generate the summary', 'error');
        return;
      }
      if (data.needs_manual) {
        setNeedsManual(true);
        setShowManual(true);
        onNotify(data.message || 'Paste or upload the transcript, then generate', 'error');
        return;
      }
      const s = data.summary || {};
      if (s.suggested_title) setTitle(s.suggested_title);
      if (s.short_description) setBrief(s.short_description);
      if (s.detailed_description) {
        setDetailed(s.detailed_description);
        setShowDetailed(true);
      }
      if (Array.isArray(s.bullets) && s.bullets.length) setBullets(s.bullets);
      const already = new Set(tagIds);
      setSuggestedTags(
        (data.suggested_tags || []).filter(
          (t: SuggestedTag) => !(t.existing_tag_id && already.has(t.existing_tag_id)),
        ),
      );
      setNeedsManual(false);
      onNotify('Draft ready. Review it, then Save.');
    } catch {
      onNotify('Could not generate the summary', 'error');
    } finally {
      setGenerating(false);
    }
  };

  // --- Drawings ------------------------------------------------------------
  const uploadClassImage = async (file: File): Promise<{ url: string; path?: string }> => {
    const token = await getToken();
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/timetable/${classId}/images`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    if (data.image) setImages((prev) => [...prev, data.image]);
    return { url: data.url, path: data.path };
  };

  // Read the teacher's downloaded transcript file (.vtt keeps its timestamps, a
  // plain .txt is sent as-is) and generate straight from it.
  const onTranscriptFile = async (file: File | null | undefined) => {
    if (!file) return;
    const text = await file.text().catch(() => '');
    if (!text.trim()) {
      onNotify('That file looks empty', 'error');
      return;
    }
    const isVtt = /\.vtt$/i.test(file.name) || text.trimStart().toUpperCase().startsWith('WEBVTT');
    await runGenerate(isVtt ? { vtt_content: text } : { transcript_text: text });
  };

  // Explicit, discoverable paste for a drawing: read the clipboard image and run
  // it through the same uploader the drop/choose path uses.
  const pasteDrawingFromClipboard = async () => {
    setPastingDrawing(true);
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        const ext = type.split('/')[1] || 'png';
        const file = new File([blob], `pasted-${ext}.${ext}`, { type });
        await uploadClassImage(file); // appends to images on success
        onNotify('Drawing pasted');
        return;
      }
      onNotify('Nothing to paste. Copy an image first, or use Ctrl+V / drop.', 'error');
    } catch {
      onNotify('Could not read the clipboard. Use Ctrl+V or drop the image instead.', 'error');
    } finally {
      setPastingDrawing(false);
    }
  };

  const onImagesChange = (urls: string[]) => {
    const removed = images.filter((r) => !urls.includes(r.url));
    setImages((prev) => prev.filter((r) => urls.includes(r.url)));
    removed.forEach(async (r) => {
      const token = await getToken();
      fetch(`/api/timetable/${classId}/images?id=${r.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    });
  };

  // --- Tags ----------------------------------------------------------------
  const toggleTag = (id: string) =>
    setTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));

  const createTag = async (label: string, group_type: 'subject' | 'theme'): Promise<string | null> => {
    try {
      const token = await getToken();
      const res = await fetch('/api/question-bank/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ group_type, label }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.data) {
        const t = data.data as TagOption;
        setAvailable((prev) => (prev.some((a) => a.id === t.id) ? prev : [...prev, t]));
        return t.id;
      }
      onNotify(res.status === 409 ? 'That tag already exists' : data.error || 'Could not create the tag', 'error');
      return null;
    } catch {
      onNotify('Could not create the tag', 'error');
      return null;
    }
  };

  const acceptSuggested = async (s: SuggestedTag) => {
    let id = s.existing_tag_id;
    if (id) {
      setAvailable((prev) =>
        prev.some((a) => a.id === id)
          ? prev
          : [...prev, { id: id as string, slug: '', label: s.label, group_type: s.group_type, color: null }],
      );
    } else {
      id = await createTag(s.label, s.group_type === 'subject' ? 'subject' : 'theme');
    }
    if (id) setTagIds((prev) => (prev.includes(id as string) ? prev : [...prev, id as string]));
    setSuggestedTags((prev) => prev.filter((x) => x.label.toLowerCase() !== s.label.toLowerCase()));
  };

  const addNewTag = async () => {
    const label = newTagLabel.trim();
    if (!label) return;
    const id = await createTag(label, newTagGroup);
    if (id) {
      setTagIds((prev) => [...prev, id]);
      setNewTagLabel('');
    }
  };

  // --- Bullets -------------------------------------------------------------
  const updateBullet = (i: number, val: string) => setBullets((prev) => prev.map((b, idx) => (idx === i ? val : b)));
  const removeBullet = (i: number) => setBullets((prev) => prev.filter((_, idx) => idx !== i));
  const addBullet = () => setBullets((prev) => [...prev, '']);

  // --- Attach recording ----------------------------------------------------
  const searchYouTube = async () => {
    if (!ytQuery.trim()) return;
    setYtSearching(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/drawing/youtube-search?q=${encodeURIComponent(ytQuery)}&limit=6`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setYtResults(data.results || []);
    } catch {
      setYtResults([]);
    } finally {
      setYtSearching(false);
    }
  };

  const pickYouTube = (url: string) => {
    setYoutubeUrl(url);
    setYtOpen(false);
    setYtResults([]);
    setYtQuery('');
  };

  // --- Save ----------------------------------------------------------------
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
          notes: detailed,
          summary_bullets: bullets.map((b) => b.trim()).filter(Boolean),
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
      {/* Generate: reads the transcript + drawings and drafts the wrap-up. */}
      <Button
        variant="outlined"
        onClick={() => runGenerate()}
        disabled={generating}
        startIcon={generating ? <CircularProgress size={16} /> : <AutoAwesomeIcon sx={{ fontSize: 18 }} />}
        fullWidth
        sx={{ mb: 1, textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control, fontWeight: 700 }}
      >
        {generating ? 'Reading the class...' : 'Generate from the class'}
      </Button>

      {!showManual && !needsManual && (
        <Button
          size="small"
          onClick={() => setShowManual(true)}
          sx={{ textTransform: 'none', mb: 1.5, minHeight: 32, px: 0 }}
        >
          Use a transcript file or paste instead
        </Button>
      )}

      {(showManual || needsManual) && (
        <Box sx={{ mb: 1.5 }}>
          <input
            ref={transcriptInputRef}
            type="file"
            accept=".vtt,.txt,text/vtt,text/plain"
            style={{ display: 'none' }}
            onChange={(e) => {
              void onTranscriptFile(e.target.files?.[0]);
              e.currentTarget.value = '';
            }}
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={<UploadFileIcon sx={{ fontSize: 16 }} />}
            onClick={() => transcriptInputRef.current?.click()}
            disabled={generating}
            sx={{ textTransform: 'none', minHeight: 40, mb: 1 }}
          >
            Upload transcript file (.vtt)
          </Button>
          <TextField
            label="Or paste the transcript"
            value={transcriptText}
            onChange={(e) => setTranscriptText(e.target.value)}
            fullWidth
            size="small"
            multiline
            minRows={3}
            placeholder="Paste the class transcript text here, then press Generate."
            helperText={
              needsManual
                ? 'Could not fetch the transcript from Teams. Upload the .vtt, paste it, or attach a class drawing, then Generate.'
                : 'Upload or paste the class transcript, then Generate.'
            }
          />
        </Box>
      )}

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
        sx={{ mb: 1 }}
      />

      {!showDetailed ? (
        <Button
          size="small"
          onClick={() => setShowDetailed(true)}
          sx={{ textTransform: 'none', mb: 1.25, minHeight: 32, px: 0 }}
        >
          Add a longer description
        </Button>
      ) : (
        <TextField
          label="Detailed description (optional)"
          value={detailed}
          onChange={(e) => setDetailed(e.target.value)}
          fullWidth
          size="small"
          multiline
          minRows={3}
          placeholder="A fuller paragraph for students who want more."
          sx={{ mb: 1.25 }}
        />
      )}

      {/* Point-by-point record of what happened. */}
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 0.625 }}>
          What we did
        </Typography>
        {bullets.map((b, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.625 }}>
            <TextField
              value={b}
              onChange={(e) => updateBullet(i, e.target.value)}
              fullWidth
              size="small"
              placeholder={`Point ${i + 1}`}
            />
            <IconButton size="small" aria-label="Remove point" onClick={() => removeBullet(i)} sx={{ width: 32, height: 32 }}>
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
        ))}
        <Button
          size="small"
          startIcon={<AddIcon sx={{ fontSize: 16 }} />}
          onClick={addBullet}
          sx={{ textTransform: 'none', minHeight: 32, px: 0 }}
        >
          Add a point
        </Button>
      </Box>

      {/* Drawings done in class: paste, drop, or choose. */}
      <Box sx={{ mb: 1.75 }}>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 0.625 }}>
          Class drawings
        </Typography>
        <ImageUploadList
          values={images.map((r) => r.url)}
          onChange={onImagesChange}
          upload={uploadClassImage}
          maxFiles={8}
          enableGlobalPaste
          helperText="Paste (Ctrl+V), drop, or choose"
        />
        <Button
          size="small"
          onClick={pasteDrawingFromClipboard}
          disabled={pastingDrawing}
          startIcon={pastingDrawing ? <CircularProgress size={14} /> : <ContentPasteIcon sx={{ fontSize: 16 }} />}
          sx={{ textTransform: 'none', minHeight: 32, px: 0, mt: 0.5 }}
        >
          {pastingDrawing ? 'Pasting...' : 'Paste from clipboard'}
        </Button>
      </Box>

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

      {/* Tags: suggestions, quick chips, and create-your-own. */}
      <Box sx={{ mt: 1.75 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block' }}>
          Tags
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
          Tap a suggestion or a chip to add it, or make a new one below (choose Subject or Theme). Tags let students find this class later.
        </Typography>
      </Box>

      {/* AI-suggested tags, shown until accepted. */}
      {suggestedTags.length > 0 && (
        <Box sx={{ mt: 1.25 }}>
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 0.625 }}>
            Suggested (tap to add)
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.625, flexWrap: 'wrap' }}>
            {suggestedTags.map((s) => (
              <Chip
                key={`${s.group_type}-${s.label}`}
                label={s.existing_tag_id ? s.label : `${s.label} (new)`}
                size="small"
                icon={<AddIcon sx={{ fontSize: 15 }} />}
                onClick={() => acceptSuggested(s)}
                sx={{
                  height: 30,
                  cursor: 'pointer',
                  color: 'primary.dark',
                  bgcolor: alpha(theme.palette.primary.main, 0.06),
                  border: `1px dashed ${theme.palette.primary.main}`,
                }}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* The same tags questions use, so recordings can be filtered by them. */}
      {tagRow('Subject', bySubject)}
      {tagRow('Theme', byTheme)}

      {/* Create a tag that does not exist yet; it joins the shared registry. */}
      <Box sx={{ mt: 1.25, display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          value={newTagLabel}
          onChange={(e) => setNewTagLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addNewTag()}
          size="small"
          placeholder="New tag"
          sx={{ flex: 1, minWidth: 120 }}
        />
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {(['subject', 'theme'] as const).map((g) => (
            <Chip
              key={g}
              label={g === 'subject' ? 'Subject' : 'Theme'}
              size="small"
              onClick={() => setNewTagGroup(g)}
              sx={{
                height: 30,
                cursor: 'pointer',
                textTransform: 'capitalize',
                fontWeight: newTagGroup === g ? 700 : 500,
                bgcolor: newTagGroup === g ? alpha(theme.palette.primary.main, 0.14) : 'transparent',
                border: `1px solid ${newTagGroup === g ? theme.palette.primary.main : theme.palette.divider}`,
              }}
            />
          ))}
        </Box>
        <Button
          size="small"
          variant="outlined"
          onClick={addNewTag}
          disabled={!newTagLabel.trim()}
          sx={{ textTransform: 'none', minHeight: 36 }}
        >
          Add
        </Button>
      </Box>

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
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start' }}>
          <TextField
            label="YouTube backup (unlisted)"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            fullWidth
            size="small"
            placeholder="https://youtu.be/..."
            helperText="Teams recordings expire after about 6 months. The unlisted YouTube copy is the durable one, and it goes into the Library with these tags."
          />
          <Button
            variant="outlined"
            onClick={() => setYtOpen(true)}
            startIcon={<YouTubeIcon sx={{ fontSize: 18, color: '#ff0000' }} />}
            sx={{ textTransform: 'none', minHeight: 40, whiteSpace: 'nowrap', mt: 0.25 }}
          >
            Search
          </Button>
        </Box>
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

      {/* Search YouTube and pick the class recording. */}
      <Dialog open={ytOpen} onClose={() => setYtOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', pb: 0.5 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>
            Attach the recording
          </Typography>
          <IconButton onClick={() => setYtOpen(false)} size="small" aria-label="Close">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              placeholder="Search YouTube..."
              size="small"
              fullWidth
              value={ytQuery}
              onChange={(e) => setYtQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchYouTube()}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 18 }} />
                  </InputAdornment>
                ),
              }}
            />
            <Button
              variant="contained"
              size="small"
              onClick={searchYouTube}
              disabled={ytSearching}
              sx={{ minWidth: 80, textTransform: 'none' }}
            >
              {ytSearching ? <CircularProgress size={18} /> : 'Search'}
            </Button>
          </Box>
          {ytResults.map((v) => (
            <Paper
              key={v.id}
              variant="outlined"
              sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1, mb: 1, '&:hover': { bgcolor: 'action.hover' } }}
            >
              {v.thumbnail_url && (
                <Box
                  component="img"
                  src={v.thumbnail_url}
                  alt=""
                  sx={{ width: 80, height: 50, objectFit: 'cover', borderRadius: 0.5, flexShrink: 0 }}
                />
              )}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  fontWeight={500}
                  sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                >
                  {v.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {v.channel_title}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                onClick={() => pickYouTube(v.url || `https://youtube.com/watch?v=${v.id}`)}
                sx={{ textTransform: 'none', minWidth: 60 }}
              >
                Add
              </Button>
            </Paper>
          ))}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
