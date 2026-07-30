'use client';

/**
 * What the class turned out to be, filled in after it happened.
 *
 * A class is often scheduled before anyone knows what it will cover, so it goes
 * into the calendar as "Class by Ar Hari Babu" and stays that way. This is
 * where it gets a real name, a short brief, a point-by-point record, the subject
 * it belonged to, the images from the class, and the recording, so the same
 * class can be found again months later.
 *
 * One image is the COVER: the teacher stars it, and it then stands in front of
 * this class everywhere it is listed, so a student can scan a week of history by
 * eye. Starring saves immediately rather than waiting for Save, because a star
 * that lies until you press a button is worse than no star.
 *
 * The teacher can fill it all in by hand, or click Generate: the app reads the
 * class transcript (and any attached images) and drafts the title, brief,
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
import ClassVideoMetaPanel from './ClassVideoMetaPanel';
import ClassImagesEditor, { type ClassImage } from './ClassImagesEditor';
import { makeThumbnail } from '@/lib/image-downscale';

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

/**
 * A tag the class needs that the registry does not have yet. Anything that DID
 * resolve to a registry tag never reaches here: it arrives in `auto_tag_ids` and
 * is ticked on without a tap.
 */
interface SuggestedTag {
  label: string;
  group_type: string;
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
  const [coverImageId, setCoverImageId] = useState<string | null>(null);
  const [pastingImage, setPastingImage] = useState(false);

  const [needsManual, setNeedsManual] = useState(false);
  const [showManual, setShowManual] = useState(false);

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
        setCoverImageId(data.cover_image_id ?? null);
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
      // An empty body is the normal case: the server resolves the transcript
      // itself, from its stored copy or from Graph. A body only appears when the
      // teacher uploaded a file, which arrives here as bodyOverride.
      const payload = bodyOverride ?? {};
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
        onNotify(data.message || 'Upload the transcript file, then generate', 'error');
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

      // Tags that already exist in the registry go straight on. The teacher
      // untick what does not belong, which is far less work than hunting for
      // the right chip in a list of eighty.
      const returnedTags = (data.tags || []) as TagOption[];
      if (returnedTags.length) {
        setAvailable((prev) => {
          const known = new Set(prev.map((t) => t.id));
          return [...prev, ...returnedTags.filter((t) => !known.has(t.id))];
        });
      }
      const autoIds = (data.auto_tag_ids || []) as string[];
      const already = new Set(tagIds);
      const appliedCount = autoIds.filter((id) => !already.has(id)).length;
      setTagIds((prev) => {
        const next = [...prev];
        for (const id of autoIds) if (!next.includes(id)) next.push(id);
        return next;
      });

      // Only what the registry could not express is left to accept by hand.
      const newSuggestions = (data.suggested_tags || []) as SuggestedTag[];
      setSuggestedTags(newSuggestions);
      setNeedsManual(false);

      const tagNote = [
        appliedCount ? `${appliedCount} tag${appliedCount === 1 ? '' : 's'} applied` : '',
        newSuggestions.length ? `${newSuggestions.length} new suggested` : '',
      ]
        .filter(Boolean)
        .join(', ');
      onNotify(tagNote ? `Draft ready (${tagNote}). Review it, then Save.` : 'Draft ready. Review it, then Save.');
    } catch {
      onNotify('Could not generate the summary', 'error');
    } finally {
      setGenerating(false);
    }
  };

  // --- Class images --------------------------------------------------------
  const uploadClassImage = async (file: File): Promise<{ url: string; path?: string }> => {
    const token = await getToken();
    const fd = new FormData();
    fd.append('file', file);

    // A small copy for the cover tiles, made here so a student scanning a week
    // of history does not download multi-megabyte whiteboard shots. Optional by
    // design: makeThumbnail returns null rather than throwing, and the server
    // falls back to the full-size url.
    const thumb = await makeThumbnail(file);
    if (thumb) fd.append('thumb', thumb.blob, `thumb.${thumb.ext === 'jpeg' ? 'jpg' : 'webp'}`);

    const res = await fetch(`/api/timetable/${classId}/images`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Upload failed');
    }
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

  // Explicit, discoverable paste for a class image: read the clipboard image and
  // run it through the same uploader the drop/choose path uses.
  const pasteImageFromClipboard = async () => {
    setPastingImage(true);
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        const ext = type.split('/')[1] || 'png';
        const file = new File([blob], `pasted-${ext}.${ext}`, { type });
        await uploadClassImage(file); // appends to images on success
        onNotify('Image pasted');
        return;
      }
      onNotify('Nothing to paste. Copy an image first, or use Ctrl+V / drop.', 'error');
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : null;
      onNotify(message || 'Could not read the clipboard. Use Ctrl+V or drop the image instead.', 'error');
    } finally {
      setPastingImage(false);
    }
  };

  const removeClassImage = async (image: ClassImage) => {
    setImages((prev) => prev.filter((r) => r.id !== image.id));
    // The database clears cover_image_id itself (ON DELETE SET NULL), but stale
    // local state would leave the filled star pointing at nothing.
    if (coverImageId === image.id) setCoverImageId(null);

    const token = await getToken();
    fetch(`/api/timetable/${classId}/images?id=${image.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  };

  const setClassCover = async (imageId: string | null) => {
    const previous = coverImageId;
    setCoverImageId(imageId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/timetable/${classId}/images`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cover_image_id: imageId }),
      });
      if (!res.ok) throw new Error('failed');
      onNotify(imageId ? 'Cover set' : 'Cover cleared');
    } catch {
      setCoverImageId(previous);
      onNotify('Could not set the cover', 'error');
    }
  };

  // --- Tags ----------------------------------------------------------------
  const toggleTag = (id: string) =>
    setTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));

  /**
   * Make sure a tag with this label exists and return its id.
   *
   * `find_or_create` is what stops a slug that is already taken from coming back
   * as a 409. It used to, and the caller then dropped the chip anyway, so the
   * teacher was told "that tag already exists" and ended up with the tag on
   * nothing.
   */
  const createTag = async (label: string, group_type: 'subject' | 'theme'): Promise<TagOption | null> => {
    try {
      const token = await getToken();
      const res = await fetch('/api/question-bank/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ group_type, label, find_or_create: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.data) {
        const t = data.data as TagOption;
        setAvailable((prev) => (prev.some((a) => a.id === t.id) ? prev : [...prev, t]));
        return t;
      }
      onNotify(data.error || 'Could not create the tag', 'error');
      return null;
    } catch {
      onNotify('Could not create the tag', 'error');
      return null;
    }
  };

  const acceptSuggested = async (s: SuggestedTag) => {
    const tag = await createTag(s.label, s.group_type === 'subject' ? 'subject' : 'theme');
    // Keep the chip when the tag could not be created. Removing it regardless is
    // how a suggestion used to disappear having attached nothing.
    if (!tag) return;
    setTagIds((prev) => (prev.includes(tag.id) ? prev : [...prev, tag.id]));
    setSuggestedTags((prev) => prev.filter((x) => x.label.toLowerCase() !== s.label.toLowerCase()));
  };

  const addNewTag = async () => {
    const label = newTagLabel.trim();
    if (!label) return;
    const tag = await createTag(label, newTagGroup);
    if (tag) {
      setTagIds((prev) => (prev.includes(tag.id) ? prev : [...prev, tag.id]));
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

  // Tag chips are the main thing a thumb aims at in this panel, so they meet
  // WCAG 2.5.5 (44px) on a phone and stay compact in the desktop side rail.
  const chipHeight = { xs: 44, sm: 30 };
  const chipGap = { xs: 1, sm: 0.625 };

  const tagRow = (label: string, options: TagOption[]) =>
    options.length > 0 && (
      <Box sx={{ mt: 1.25 }}>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 0.625 }}>
          {label}
        </Typography>
        <Box sx={{ display: 'flex', gap: chipGap, flexWrap: 'wrap' }}>
          {options.map((t) => {
            const on = tagIds.includes(t.id);
            return (
              <Chip
                key={t.id}
                label={t.label}
                size="small"
                onClick={() => toggleTag(t.id)}
                data-testid="wrapup-tag"
                data-selected={on ? 'true' : 'false'}
                sx={{
                  height: chipHeight,
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
      {/* Generate: reads the transcript + class images and drafts the wrap-up. */}
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
          Upload a transcript file instead
        </Button>
      )}

      {/*
        The manual fallback, one button. There used to be a paste box beside it,
        which is gone on purpose: nobody pastes a 50 KB transcript by hand, it
        cost three rows of height in a drawer that is tight on mobile, and the
        automatic fetch now works, so this is the rare path rather than the
        normal one. The file input still accepts .txt, so a teacher with a plain
        text transcript is not stranded.
      */}
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
            fullWidth
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Upload transcript file (.vtt)
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
            {needsManual
              ? 'Could not fetch the transcript from Teams. Download the .vtt from the meeting and upload it, or attach a class image, then Generate.'
              : 'Only needed when Teams has not published the transcript yet.'}
          </Typography>
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

      {/* Pictures from the class: paste, drop, or choose. Star one as the cover. */}
      <Box sx={{ mb: 1.75 }}>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 0.625 }}>
          Class images
        </Typography>
        <ClassImagesEditor
          images={images}
          coverImageId={coverImageId}
          upload={uploadClassImage}
          onRemove={removeClassImage}
          onSetCover={setClassCover}
          maxFiles={8}
        />
        <Button
          size="small"
          onClick={pasteImageFromClipboard}
          disabled={pastingImage}
          startIcon={pastingImage ? <CircularProgress size={14} /> : <ContentPasteIcon sx={{ fontSize: 16 }} />}
          sx={{ textTransform: 'none', minHeight: 32, px: 0, mt: 0.5 }}
        >
          {pastingImage ? 'Pasting...' : 'Paste from clipboard'}
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
          Generate ticks the tags that already fit. Tap any chip to add or remove one, or make a new one below (choose Subject or Theme). Tags let students find this class later.
        </Typography>
      </Box>

      {/* AI-suggested tags, shown until accepted. */}
      {suggestedTags.length > 0 && (
        <Box sx={{ mt: 1.25 }}>
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 0.625 }}>
            New ideas (tap to add to the tag list)
          </Typography>
          <Box sx={{ display: 'flex', gap: chipGap, flexWrap: 'wrap' }}>
            {suggestedTags.map((s) => (
              <Chip
                key={`${s.group_type}-${s.label}`}
                label={`${s.label} (new)`}
                size="small"
                icon={<AddIcon sx={{ fontSize: 15 }} />}
                onClick={() => acceptSuggested(s)}
                data-testid="wrapup-suggested-tag"
                sx={{
                  height: chipHeight,
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
                height: chipHeight,
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

      {/* Publishing the recording is a separate job done at a separate time, so
          it gets its own collapsed panel rather than more fields in this form. */}
      <ClassVideoMetaPanel
        classId={classId}
        getToken={getToken}
        onNotify={onNotify}
        onSaved={onSaved}
      />

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
