'use client';

/**
 * Prepare a class recording for YouTube.
 *
 * Five steps, in the order the job actually happens: copy a prompt, paste the
 * JSON back, review what it wrote, copy the three fields into YouTube Studio,
 * then come back and paste the video URL.
 *
 * It lives in its own file rather than inside WrapUpSection because that file is
 * already 800 lines doing a different job (recording what the class was), and
 * this is a separate task done at a separate time (publishing it).
 *
 * The AI runs outside the app. There is one shared GEMINI_API_KEY across recaps,
 * drawing feedback and class summaries, and exhausting it 429s all of them, so
 * this uses the copy-prompt/paste-JSON bridge that class-ai-draft.ts and
 * topic-quick-add.ts established: no server AI, no cost, no rate limit.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Step,
  StepContent,
  StepLabel,
  Stepper,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import YouTubeIcon from '@mui/icons-material/YouTube';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import {
  parseVideoMeta,
  parseChapterTime,
  buildYouTubeTags,
  type AllowedTag,
} from '@/lib/class-video-meta-schema';
import {
  buildYouTubeTitle,
  buildYouTubeDescription,
  formatChapterTime,
  tagsCharCount,
  validateChapters,
  YT_DESCRIPTION_MAX,
  YT_TAGS_MAX_CHARS,
  YT_TITLE_MAX,
} from '@/lib/youtube-metadata';
import type { ClassVideoChapter } from '@neram/database/types';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { RADIUS } from './timetable-theme';

interface RegistryTag extends AllowedTag {
  id: string;
  color?: string | null;
}

interface Props {
  classId: string;
  getToken: () => Promise<string | null>;
  /** Bubble a message to the parent's snackbar. */
  onNotify?: (message: string) => void;
  /** Tell the parent the class row changed, so it refetches. */
  onSaved?: () => void;
}

const LANGUAGES = [
  { value: 'ta', label: 'Tamil' },
  { value: 'en', label: 'English' },
  { value: 'ta_en', label: 'Tamil + English' },
];
const EXAMS = [
  { value: 'nata', label: 'NATA' },
  { value: 'jee_barch', label: 'JEE B.Arch' },
  { value: 'both', label: 'Both' },
  { value: 'general', label: 'General' },
];
const DIFFICULTIES = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'mixed', label: 'All levels' },
];
const CATEGORIES = [
  { value: 'drawing', label: 'Drawing' },
  { value: 'aptitude', label: 'Aptitude' },
  { value: 'mathematics', label: 'Mathematics' },
  { value: 'general_knowledge', label: 'General Knowledge' },
  { value: 'exam_preparation', label: 'Exam Preparation' },
  { value: 'orientation', label: 'Orientation' },
];

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  ready: 'Ready to upload',
  published: 'Published',
};

/** Copy button that confirms in place, the idiom PasteAssignmentsDialog uses. */
function CopyButton({
  text,
  label,
  fullWidth,
  disabled,
}: {
  text: string;
  label: string;
  fullWidth?: boolean;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outlined"
      fullWidth={fullWidth}
      disabled={disabled || !text}
      startIcon={copied ? <CheckIcon /> : <ContentCopyIcon />}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          /* clipboard blocked, the field is still selectable by hand */
        }
      }}
      sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
    >
      {copied ? 'Copied' : label}
    </Button>
  );
}

export default function ClassVideoMetaPanel({ classId, getToken, onNotify, onSaved }: Props) {
  const theme = useTheme();
  const { featureFlags } = useNexusAuthContext();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  const [registry, setRegistry] = useState<RegistryTag[]>([]);
  const [status, setStatus] = useState<string>('draft');
  const [classYoutubeUrl, setClassYoutubeUrl] = useState('');

  // Step 1
  const [prompt, setPrompt] = useState('');
  const [promptLoading, setPromptLoading] = useState(false);
  const [transcriptInfo, setTranscriptInfo] = useState<{ found: boolean; segments: number } | null>(null);
  const transcriptFileRef = useRef<HTMLInputElement>(null);

  // Step 2
  const [pasteText, setPasteText] = useState('');
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);

  // Step 3, the editable result
  const [ytTitle, setYtTitle] = useState('');
  const [ytDescription, setYtDescription] = useState('');
  const [ytTags, setYtTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [chapters, setChapters] = useState<ClassVideoChapter[]>([]);
  const [searchTerms, setSearchTerms] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [exam, setExam] = useState('');
  const [language, setLanguage] = useState('');
  const [difficulty, setDifficulty] = useState('');

  // Step 5
  const [youtubeUrl, setYoutubeUrl] = useState('');

  const authed = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getToken();
      return fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init?.headers || {}),
        },
      });
    },
    [getToken],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authed(`/api/timetable/${classId}/video-meta`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load');

      setRegistry(json.registry || []);
      setSelectedTagIds((json.tags || []).map((t: RegistryTag) => t.id));
      setClassYoutubeUrl(json.class?.youtube_url || '');
      setYoutubeUrl(json.class?.youtube_url || '');

      const meta = json.meta;
      if (meta) {
        setStatus(meta.status || 'draft');
        setYtTitle(meta.yt_title || '');
        setYtDescription(meta.yt_description || '');
        setYtTags(meta.yt_tags || []);
        setChapters(Array.isArray(meta.chapters) ? meta.chapters : []);
        setSearchTerms(meta.search_terms || []);
        setCategory(meta.category || '');
        setExam(meta.exam || '');
        setLanguage(meta.language || '');
        setDifficulty(meta.difficulty || '');
        // A draft that already has a title is past the paste step.
        if (meta.yt_title) setActiveStep(meta.status === 'published' ? 4 : 2);
      }
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Could not load the video metadata');
    } finally {
      setLoading(false);
    }
  }, [authed, classId, onNotify]);

  useEffect(() => {
    if (open && !registry.length) void load();
  }, [open, registry.length, load]);

  const allowedTags: AllowedTag[] = useMemo(
    () => registry.filter((t) => t.group_type !== 'exam'),
    [registry],
  );

  /**
   * Build the prompt. An empty body is the normal case: the server resolves the
   * transcript itself, from the copy stored for this class or from Graph. A body
   * only appears when the teacher just uploaded a file.
   */
  const buildPrompt = async (bodyOverride?: Record<string, unknown>) => {
    setPromptLoading(true);
    try {
      const res = await authed(`/api/timetable/${classId}/video-meta/prompt`, {
        method: 'POST',
        body: JSON.stringify(bodyOverride ?? {}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not build the prompt');
      setPrompt(json.prompt);
      setTranscriptInfo(json.transcript);
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Could not build the prompt');
    } finally {
      setPromptLoading(false);
    }
  };

  /**
   * Read the teacher's downloaded transcript and rebuild from it. A .vtt keeps
   * its timestamps, which is the whole point here: without them the prompt is
   * told not to invent chapters. Mirrors onTranscriptFile in WrapUpSection.
   */
  const onTranscriptFile = async (file: File | null | undefined) => {
    if (!file) return;
    const text = await file.text().catch(() => '');
    if (!text.trim()) {
      onNotify?.('That file looks empty');
      return;
    }
    const isVtt = /\.vtt$/i.test(file.name) || text.trimStart().toUpperCase().startsWith('WEBVTT');
    await buildPrompt(isVtt ? { vtt_content: text } : { transcript_text: text });
  };

  /** Turn the pasted JSON into the three fields that go to YouTube. */
  const applyPaste = () => {
    const result = parseVideoMeta(pasteText, allowedTags);
    setParseErrors(result.errors);
    setParseWarnings(result.warnings);
    if (!result.valid || !result.data) return;

    const d = result.data;
    const bySlug = new Map(registry.map((t) => [t.slug, t]));
    const chosen = d.tagSlugs.map((s) => bySlug.get(s)).filter(Boolean) as RegistryTag[];
    const topicLabels = chosen.map((t) => t.label);
    const subject = chosen.find((t) => t.group_type === 'subject')?.label || null;

    setYtTitle(buildYouTubeTitle({
      topic: d.topicPhrase, exam: d.exam, subject, language: d.language,
    }));
    setYtDescription(buildYouTubeDescription({
      hook: d.hook,
      bullets: d.bullets,
      chapters: d.chapters,
      topics: topicLabels,
      searchTerms: d.searchTerms,
      exam: d.exam,
      difficulty: d.difficulty,
      language: d.language,
    }));
    setYtTags(buildYouTubeTags({
      topics: topicLabels, searchTerms: d.searchTerms, exam: d.exam,
    }));
    setChapters(d.chapters);
    setSearchTerms(d.searchTerms);
    if (chosen.length) setSelectedTagIds(chosen.map((t) => t.id));
    if (d.category) setCategory(d.category);
    if (d.exam) setExam(d.exam);
    if (d.language) setLanguage(d.language);
    if (d.difficulty) setDifficulty(d.difficulty);
    setActiveStep(2);
  };

  const save = async (nextStatus?: string, withUrl?: boolean) => {
    setSaving(true);
    try {
      const res = await authed(`/api/timetable/${classId}/video-meta`, {
        method: 'PATCH',
        body: JSON.stringify({
          yt_title: ytTitle,
          yt_description: ytDescription,
          yt_tags: ytTags,
          chapters,
          search_terms: searchTerms,
          category: category || null,
          exam: exam || null,
          language: language || null,
          difficulty: difficulty || null,
          tag_ids: selectedTagIds,
          ...(nextStatus ? { status: nextStatus } : {}),
          ...(withUrl ? { youtube_url: youtubeUrl } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save');
      if (nextStatus) setStatus(nextStatus);
      if (withUrl) {
        setClassYoutubeUrl(youtubeUrl);
        onNotify?.(
          json.librarySynced
            ? 'Published. The class is in the student Library with these tags.'
            : 'Saved, but the Library did not pick it up. Check the YouTube link.',
        );
        onSaved?.();
      } else {
        onNotify?.('Saved');
      }
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const chapterProblems = useMemo(() => validateChapters(chapters), [chapters]);
  const tagChars = tagsCharCount(ytTags);
  const titleOver = ytTitle.length > YT_TITLE_MAX;
  const descOver = ytDescription.length > YT_DESCRIPTION_MAX;
  const tagsOver = tagChars > YT_TAGS_MAX_CHARS;
  const canPublish = Boolean(ytTitle.trim()) && !titleOver && !descOver && !tagsOver;

  const statusColor =
    status === 'published' ? 'success' : status === 'ready' ? 'warning' : 'default';

  // Behavioural flag, no route of its own. Switching it off at
  // /teacher/admin/features hides publishing without hiding the wrap-up.
  // Checked after the hooks so the hook order never changes between renders.
  if (featureFlags['staff.class-video-meta'] === false) return null;

  return (
    <Paper
      variant="outlined"
      sx={{ mt: 2, borderRadius: RADIUS.card, overflow: 'hidden' }}
    >
      <Box
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setOpen((v) => !v);
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1.5,
          minHeight: 48,
          cursor: 'pointer',
          bgcolor: alpha(theme.palette.error.main, 0.04),
        }}
      >
        <YouTubeIcon sx={{ color: '#ff0000' }} />
        <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>
          Publish to YouTube
        </Typography>
        <Chip size="small" label={STATUS_LABELS[status] || status} color={statusColor as never} />
        <ExpandMoreIcon
          sx={{
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
            color: theme.palette.text.secondary,
          }}
        />
      </Box>

      <Collapse in={open} unmountOnExit>
        <Divider />
        <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Stepper activeStep={activeStep} orientation="vertical" nonLinear>
              {/* ---------------------------------------------------------- */}
              <Step completed={Boolean(prompt)}>
                <StepLabel onClick={() => setActiveStep(0)} sx={{ cursor: 'pointer' }}>
                  Copy the prompt
                </StepLabel>
                <StepContent>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    This builds one block with the class details, the Teams transcript and the
                    list of topics you are allowed to pick from. Paste it into ChatGPT, Gemini or
                    Claude.
                  </Typography>

                  {transcriptInfo && (
                    <Alert severity={transcriptInfo.found ? 'success' : 'warning'} sx={{ mb: 1.5 }}>
                      {transcriptInfo.found
                        ? `Transcript found, ${transcriptInfo.segments} segments. Chapters will have real timestamps.`
                        : 'No transcript found. The prompt will work from the class notes, and it will not invent chapters. Upload the .vtt from the meeting to get real chapter timestamps.'}
                    </Alert>
                  )}

                  {/*
                    Upload, not paste. This step used to offer a paste box and
                    nothing else, so the only way to supply a transcript by hand
                    was to paste tens of thousands of characters into a three-row
                    field. The file goes to the same route as a `vtt_content`
                    body, and the server stores it, so it also fixes the Wrap Up
                    section above and never has to be supplied twice.
                  */}
                  {transcriptInfo && !transcriptInfo.found && (
                    <Box sx={{ mb: 1.5 }}>
                      <input
                        ref={transcriptFileRef}
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
                        onClick={() => transcriptFileRef.current?.click()}
                        disabled={promptLoading}
                        fullWidth
                        sx={{ textTransform: 'none', minHeight: 44 }}
                      >
                        Upload transcript file (.vtt)
                      </Button>
                    </Box>
                  )}

                  <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1 }}>
                    <Button
                      variant="contained"
                      onClick={() => void buildPrompt()}
                      disabled={promptLoading}
                      sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
                    >
                      {promptLoading ? 'Reading the class...' : prompt ? 'Rebuild' : 'Build the prompt'}
                    </Button>
                    {prompt && <CopyButton text={prompt} label="Copy prompt" fullWidth />}
                  </Box>

                  {prompt && (
                    <Button
                      onClick={() => setActiveStep(1)}
                      sx={{ mt: 1, textTransform: 'none', minHeight: 44 }}
                    >
                      Next, paste the result
                    </Button>
                  )}
                </StepContent>
              </Step>

              {/* ---------------------------------------------------------- */}
              <Step completed={Boolean(ytTitle)}>
                <StepLabel onClick={() => setActiveStep(1)} sx={{ cursor: 'pointer' }}>
                  Paste what it gave back
                </StepLabel>
                <StepContent>
                  <TextField
                    label="Paste the JSON"
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    fullWidth
                    multiline
                    minRows={5}
                    size="small"
                    placeholder='{ "topic_phrase": "...", ... }'
                  />
                  {parseErrors.map((e) => (
                    <Alert key={e} severity="error" sx={{ mt: 1 }}>{e}</Alert>
                  ))}
                  {parseWarnings.map((w) => (
                    <Alert key={w} severity="warning" sx={{ mt: 1 }}>{w}</Alert>
                  ))}
                  <Button
                    variant="contained"
                    onClick={applyPaste}
                    disabled={!pasteText.trim()}
                    sx={{ mt: 1.5, textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
                  >
                    Use this
                  </Button>
                </StepContent>
              </Step>

              {/* ---------------------------------------------------------- */}
              <Step completed={Boolean(ytTitle) && canPublish}>
                <StepLabel onClick={() => setActiveStep(2)} sx={{ cursor: 'pointer' }}>
                  Review and edit
                </StepLabel>
                <StepContent>
                  <TextField
                    label="YouTube title"
                    value={ytTitle}
                    onChange={(e) => setYtTitle(e.target.value)}
                    fullWidth
                    size="small"
                    error={titleOver}
                    helperText={`${ytTitle.length} / ${YT_TITLE_MAX}. The first 60 or so characters are what shows on a phone.`}
                    sx={{ mb: 1.5 }}
                  />

                  <TextField
                    label="YouTube description"
                    value={ytDescription}
                    onChange={(e) => setYtDescription(e.target.value)}
                    fullWidth
                    multiline
                    minRows={8}
                    size="small"
                    error={descOver}
                    helperText={`${ytDescription.length} / ${YT_DESCRIPTION_MAX}. This is also what students search inside the Library.`}
                    sx={{ mb: 1.5 }}
                  />

                  {/* Chapters */}
                  <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
                    Chapters
                  </Typography>
                  {chapterProblems.map((p) => (
                    <Alert key={p.message} severity="warning" sx={{ mb: 1 }}>{p.message}</Alert>
                  ))}
                  {chapters.map((c, i) => (
                    <Box key={`${c.t}-${i}`} sx={{ display: 'flex', gap: 0.75, mb: 0.75 }}>
                      <TextField
                        value={formatChapterTime(c.t)}
                        onChange={(e) => {
                          const t = parseChapterTime(e.target.value);
                          if (t === null) return;
                          setChapters((prev) => prev.map((x, xi) => (xi === i ? { ...x, t } : x)));
                        }}
                        size="small"
                        sx={{ width: 96, flexShrink: 0 }}
                        inputProps={{ 'aria-label': `Chapter ${i + 1} time` }}
                      />
                      <TextField
                        value={c.label}
                        onChange={(e) =>
                          setChapters((prev) =>
                            prev.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x)))
                        }
                        size="small"
                        fullWidth
                        inputProps={{ 'aria-label': `Chapter ${i + 1} label` }}
                      />
                      <IconButton
                        onClick={() => setChapters((prev) => prev.filter((_, xi) => xi !== i))}
                        aria-label={`Remove chapter ${i + 1}`}
                        sx={{ width: 44, height: 44, flexShrink: 0 }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                  <Button
                    startIcon={<AddIcon />}
                    onClick={() =>
                      setChapters((prev) => [
                        ...prev,
                        { t: prev.length ? prev[prev.length - 1].t + 60 : 0, label: '' },
                      ])
                    }
                    sx={{ textTransform: 'none', minHeight: 44, mb: 1.5 }}
                  >
                    Add chapter
                  </Button>

                  {/* Topic tags from the canonical registry */}
                  <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
                    Topics
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                    Only these count for search. A student tapping a topic gets every class that
                    carries it.
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
                    {allowedTags.map((t) => {
                      const tag = t as RegistryTag;
                      const on = selectedTagIds.includes(tag.id);
                      return (
                        <Chip
                          key={tag.id}
                          label={tag.label}
                          onClick={() =>
                            setSelectedTagIds((prev) =>
                              on ? prev.filter((x) => x !== tag.id) : [...prev, tag.id])
                          }
                          color={on ? 'primary' : 'default'}
                          variant={on ? 'filled' : 'outlined'}
                          sx={{ height: 34 }}
                        />
                      );
                    })}
                  </Box>

                  {/* YouTube tags box */}
                  <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
                    YouTube tags
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.75 }}>
                    {ytTags.map((t) => (
                      <Chip
                        key={t}
                        label={t}
                        size="small"
                        onDelete={() => setYtTags((prev) => prev.filter((x) => x !== t))}
                      />
                    ))}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.75, mb: 0.5 }}>
                    <TextField
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' || !newTag.trim()) return;
                        e.preventDefault();
                        setYtTags((prev) => [...new Set([...prev, newTag.trim()])]);
                        setNewTag('');
                      }}
                      size="small"
                      fullWidth
                      placeholder="Add a tag and press Enter"
                    />
                  </Box>
                  <Typography
                    variant="caption"
                    color={tagsOver ? 'error' : 'text.secondary'}
                    sx={{ display: 'block', mb: 1.5 }}
                  >
                    {tagChars} / {YT_TAGS_MAX_CHARS} characters. YouTube drops the rest silently.
                  </Typography>

                  {/* Classification */}
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                      gap: 1.25,
                      mb: 1.5,
                    }}
                  >
                    <TextField
                      select label="Library category" value={category} size="small"
                      onChange={(e) => setCategory(e.target.value)}
                      helperText="Which row it appears under"
                    >
                      {CATEGORIES.map((o) => (
                        <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      select label="Exam" value={exam} size="small"
                      onChange={(e) => setExam(e.target.value)}
                    >
                      {EXAMS.map((o) => (
                        <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      select label="Language" value={language} size="small"
                      onChange={(e) => setLanguage(e.target.value)}
                      helperText="Leave blank and the Tamil / English filters will hide it"
                    >
                      {LANGUAGES.map((o) => (
                        <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      select label="Level" value={difficulty} size="small"
                      onChange={(e) => setDifficulty(e.target.value)}
                    >
                      {DIFFICULTIES.map((o) => (
                        <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                      ))}
                    </TextField>
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1 }}>
                    <Button
                      variant="outlined"
                      onClick={() => save()}
                      disabled={saving}
                      sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
                    >
                      {saving ? 'Saving...' : 'Save draft'}
                    </Button>
                    <Button
                      variant="contained"
                      onClick={() => { void save('ready'); setActiveStep(3); }}
                      disabled={saving || !canPublish}
                      sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
                    >
                      Ready to upload
                    </Button>
                  </Box>
                </StepContent>
              </Step>

              {/* ---------------------------------------------------------- */}
              <Step completed={status === 'published'}>
                <StepLabel onClick={() => setActiveStep(3)} sx={{ cursor: 'pointer' }}>
                  Copy into YouTube Studio
                </StepLabel>
                <StepContent>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1.5 }}>
                    <CopyButton text={ytTitle} label="Copy title" fullWidth />
                    <CopyButton text={ytDescription} label="Copy description" fullWidth />
                    <CopyButton text={ytTags.join(', ')} label="Copy tags" fullWidth />
                  </Box>
                  <Alert severity="info" icon={false}>
                    <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>
                      Before you hit publish on YouTube
                    </Typography>
                    <Box component="ul" sx={{ m: 0, pl: 2.5, '& li': { mb: 0.25 } }}>
                      <li>Set visibility to <strong>Unlisted</strong>, not Public.</li>
                      <li>Add it to the subject playlist.</li>
                      <li>Answer &quot;No, it is not made for kids&quot;.</li>
                      <li>Leave the timestamps in the description so chapters appear.</li>
                    </Box>
                  </Alert>
                  <Button
                    onClick={() => setActiveStep(4)}
                    sx={{ mt: 1, textTransform: 'none', minHeight: 44 }}
                  >
                    Uploaded, next step
                  </Button>
                </StepContent>
              </Step>

              {/* ---------------------------------------------------------- */}
              <Step completed={status === 'published' && Boolean(classYoutubeUrl)}>
                <StepLabel onClick={() => setActiveStep(4)} sx={{ cursor: 'pointer' }}>
                  Paste the video link
                </StepLabel>
                <StepContent>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    This is what puts the class into the student Library with everything above
                    attached to it.
                  </Typography>
                  <TextField
                    label="YouTube URL"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    fullWidth
                    size="small"
                    placeholder="https://youtu.be/..."
                    sx={{ mb: 1.5 }}
                  />
                  <Button
                    variant="contained"
                    onClick={() => save('published', true)}
                    disabled={saving || !youtubeUrl.trim() || !canPublish}
                    fullWidth
                    sx={{
                      textTransform: 'none',
                      minHeight: 48,
                      borderRadius: RADIUS.control,
                      fontWeight: 700,
                    }}
                  >
                    {saving ? 'Publishing...' : 'Publish to the Library'}
                  </Button>
                </StepContent>
              </Step>
            </Stepper>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}
