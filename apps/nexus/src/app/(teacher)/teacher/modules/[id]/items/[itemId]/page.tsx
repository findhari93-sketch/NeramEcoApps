'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Switch,
  IconButton,
  Skeleton,
  Collapse,
  Divider,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  alpha,
  useTheme,
  ToggleButton,
  ToggleButtonGroup,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import OndemandVideoOutlinedIcon from '@mui/icons-material/OndemandVideoOutlined';
import CloudOutlinedIcon from '@mui/icons-material/CloudOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { toEmbedUrl } from '@/components/foundation/SharePointPlayer';

/* ---------- local types (no Foundation type imports) ---------- */

interface ModuleItem {
  id: string;
  module_id: string;
  title: string;
  description: string | null;
  item_type: string;
  video_source: 'youtube' | 'sharepoint' | null;
  youtube_video_id: string | null;
  sharepoint_video_url: string | null;
  video_duration_seconds: number | null;
  chapter_number: number | null;
  is_published: boolean;
  sort_order: number;
  [key: string]: unknown;
}

interface ModuleSection {
  id: string;
  module_item_id: string;
  title: string;
  description: string | null;
  start_timestamp_seconds: number;
  end_timestamp_seconds: number;
  sort_order: number;
  min_questions_to_pass: number | null;
  [key: string]: unknown;
}

interface SectionWithCount extends ModuleSection {
  question_count: number;
}

interface QuizQuestion {
  id: string;
  section_id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'a' | 'b' | 'c' | 'd';
  explanation: string | null;
  sort_order: number;
  [key: string]: unknown;
}

/* ---------- component ---------- */

export default function ModuleItemEditorPage() {
  const theme = useTheme();
  const router = useRouter();
  const params = useParams();
  const moduleId = params.id as string;
  const itemId = params.itemId as string;
  const { getToken, loading: authLoading } = useNexusAuthContext();

  const [item, setItem] = useState<ModuleItem | null>(null);
  const [sections, setSections] = useState<SectionWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // Item form state
  const [form, setForm] = useState({
    title: '',
    description: '',
    video_source: 'youtube' as 'youtube' | 'sharepoint',
    youtube_video_id: '',
    sharepoint_video_url: '',
    video_duration_seconds: 0,
    chapter_number: 0,
    is_published: false,
  });

  // Section expansion & editing
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [sectionQuestions, setSectionQuestions] = useState<Record<string, QuizQuestion[]>>({});
  const [loadingQuestions, setLoadingQuestions] = useState<string | null>(null);

  // Add section dialog
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [newSection, setNewSection] = useState({ title: '', start_min: 0, start_sec: 0, end_min: 0, end_sec: 0 });

  // Add question dialog
  const [addQuestionSection, setAddQuestionSection] = useState<string | null>(null);
  const [newQuestion, setNewQuestion] = useState({
    question_text: '',
    option_a: '',
    option_b: '',
    option_c: '',
    option_d: '',
    correct_option: 'a' as 'a' | 'b' | 'c' | 'd',
    explanation: '',
  });

  // YouTube preview
  const playerRef = useRef<any>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const timeIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  /* ---- fetch item + sections ---- */
  const fetchItem = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      // Fetch item detail (includes sections with quiz_questions arrays)
      const res = await fetch(`/api/modules/${moduleId}/items/${itemId}/detail`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const fetchedItem = data.item as ModuleItem & { sections?: any[] };
        setItem(fetchedItem);

        // Map sections — detail endpoint returns quiz_questions arrays, derive count
        const fetchedSections: SectionWithCount[] = (fetchedItem.sections || []).map((s: any) => ({
          ...s,
          question_count: Array.isArray(s.quiz_questions) ? s.quiz_questions.length : 0,
        }));
        setSections(fetchedSections);

        setForm({
          title: fetchedItem.title || '',
          description: fetchedItem.description || '',
          video_source: fetchedItem.video_source || 'youtube',
          youtube_video_id: fetchedItem.youtube_video_id || '',
          sharepoint_video_url: fetchedItem.sharepoint_video_url || '',
          video_duration_seconds: fetchedItem.video_duration_seconds || 0,
          chapter_number: fetchedItem.chapter_number ?? 0,
          is_published: fetchedItem.is_published || false,
        });
      }
    } catch (err) {
      console.error('Failed to load item:', err);
    } finally {
      setLoading(false);
    }
  }, [moduleId, itemId, getToken]);

  useEffect(() => {
    if (!authLoading) fetchItem();
  }, [authLoading, fetchItem]);

  // Initialize YouTube player for preview (only for YouTube source)
  useEffect(() => {
    if (!form.youtube_video_id?.trim() || loading || form.video_source !== 'youtube') return;

    const videoId = form.youtube_video_id.trim();

    const initPlayer = () => {
      if (!playerContainerRef.current || !window.YT?.Player) return;
      try {
        if (playerRef.current?.destroy) playerRef.current.destroy();

        playerRef.current = new window.YT.Player(playerContainerRef.current, {
          videoId,
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
          events: {
            onReady: () => {
              setPlayerReady(true);
              const dur = playerRef.current?.getDuration?.() || 0;
              if (dur > 0 && !form.video_duration_seconds) {
                setForm(prev => ({ ...prev, video_duration_seconds: Math.round(dur) }));
              }
            },
            onStateChange: (event: any) => {
              if (event.data === window.YT.PlayerState.PLAYING) {
                if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
                timeIntervalRef.current = setInterval(() => {
                  const t = playerRef.current?.getCurrentTime?.() || 0;
                  setCurrentTime(t);
                }, 500);
              } else {
                if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
              }
            },
          },
        });
      } catch (err) {
        console.warn('YouTube player init failed:', err);
      }
    };

    if (window.YT?.Player) {
      initPlayer();
    } else {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScript = document.getElementsByTagName('script')[0];
      firstScript?.parentNode?.insertBefore(tag, firstScript);
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
      window.onYouTubeIframeAPIReady = undefined;
    };
  }, [form.youtube_video_id, form.video_source, loading]);

  const seekTo = (seconds: number) => {
    playerRef.current?.seekTo(seconds, true);
    playerRef.current?.playVideo();
  };

  /* ---- save item ---- */
  const handleSave = async (asDraft?: boolean) => {
    setSaving(true);
    setSaveStatus('idle');
    const payload = asDraft ? { ...form, is_published: false } : form;
    if (asDraft) setForm(prev => ({ ...prev, is_published: false }));
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/modules/${moduleId}/items/${itemId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } catch (err) {
      console.error('Failed to save:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setSaving(false);
    }
  };

  /* ---- section CRUD ---- */
  const handleAddSection = async () => {
    const startSec = newSection.start_min * 60 + newSection.start_sec;
    const endSec = newSection.end_min * 60 + newSection.end_sec;
    if (!newSection.title.trim() || endSec <= startSec) return;

    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/modules/${moduleId}/items/${itemId}/sections`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newSection.title.trim(),
          start_timestamp_seconds: startSec,
          end_timestamp_seconds: endSec,
          sort_order: sections.length,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const created = data.section;
        if (created) {
          setSections(prev => [...prev, { ...created, question_count: 0, min_questions_to_pass: null }]);
        }
        setAddSectionOpen(false);
        setNewSection({ title: '', start_min: 0, start_sec: 0, end_min: 0, end_sec: 0 });
      }
    } catch (err) {
      console.error('Failed to add section:', err);
    }
  };

  const handleDeleteSection = async (sectionId: string) => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/modules/${moduleId}/items/${itemId}/sections/${sectionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setSections(prev => prev.filter(s => s.id !== sectionId));
        if (expandedSection === sectionId) setExpandedSection(null);
      }
    } catch (err) {
      console.error('Failed to delete section:', err);
    }
  };

  /* ---- question CRUD ---- */
  const fetchQuestions = async (sectionId: string) => {
    setLoadingQuestions(sectionId);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/modules/${moduleId}/items/${itemId}/sections/${sectionId}/questions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSectionQuestions(prev => ({ ...prev, [sectionId]: data.questions || [] }));
      }
    } catch (err) {
      console.error('Failed to load questions:', err);
    } finally {
      setLoadingQuestions(null);
    }
  };

  const handleExpandSection = (sectionId: string) => {
    if (expandedSection === sectionId) {
      setExpandedSection(null);
    } else {
      setExpandedSection(sectionId);
      if (!sectionQuestions[sectionId]) {
        fetchQuestions(sectionId);
      }
    }
  };

  const handleAddQuestion = async () => {
    if (!addQuestionSection || !newQuestion.question_text.trim()) return;
    const sectionId = addQuestionSection;
    try {
      const token = await getToken();
      if (!token) return;
      const existingCount = sectionQuestions[sectionId]?.length || 0;
      const res = await fetch(`/api/modules/${moduleId}/items/${itemId}/sections/${sectionId}/questions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newQuestion, sort_order: existingCount }),
      });
      if (res.ok) {
        const data = await res.json();
        const created = data.question;
        if (created) {
          setSectionQuestions(prev => ({
            ...prev,
            [sectionId]: [...(prev[sectionId] || []), created],
          }));
          setSections(prev => prev.map(s =>
            s.id === sectionId ? { ...s, question_count: s.question_count + 1 } : s
          ));
        }
        setAddQuestionSection(null);
        setNewQuestion({ question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: 'a', explanation: '' });
      }
    } catch (err) {
      console.error('Failed to add question:', err);
    }
  };

  const handleDeleteQuestion = async (questionId: string, sectionId: string) => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/modules/${moduleId}/items/${itemId}/questions/${questionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setSectionQuestions(prev => ({
          ...prev,
          [sectionId]: (prev[sectionId] || []).filter(q => q.id !== questionId),
        }));
        setSections(prev => prev.map(s =>
          s.id === sectionId ? { ...s, question_count: Math.max(0, s.question_count - 1) } : s
        ));
      }
    } catch (err) {
      console.error('Failed to delete question:', err);
    }
  };

  /* ---- loading / not-found states ---- */
  if (loading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={48} sx={{ borderRadius: 2, mb: 2 }} />
        <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 2, mb: 2 }} />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} variant="rectangular" height={64} sx={{ borderRadius: 2, mb: 1 }} />
        ))}
      </Box>
    );
  }

  if (!item) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>Item not found</Typography>
      </Box>
    );
  }

  /* ---- render ---- */
  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton onClick={() => router.push(`/teacher/modules/${moduleId}`)}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
            Edit Item
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => handleSave(true)}
            disabled={saving}
            size="small"
            sx={{ textTransform: 'none', borderRadius: 2, fontSize: '0.8rem' }}
          >
            Save Draft
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveOutlinedIcon />}
            onClick={() => handleSave()}
            disabled={saving}
            color={saveStatus === 'saved' ? 'success' : saveStatus === 'error' ? 'error' : 'primary'}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            {saving ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Failed' : 'Save'}
          </Button>
        </Box>
      </Box>

      {/* Item Details Form */}
      <Paper elevation={0} sx={{ p: 2.5, borderRadius: 2.5, border: `1px solid ${theme.palette.divider}`, mb: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Item Title"
            value={form.title}
            onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
            fullWidth
            size="small"
          />
          <TextField
            label="Description (optional)"
            value={form.description}
            onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
            fullWidth
            size="small"
            multiline
            rows={2}
          />
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5, display: 'block' }}>
              Video Source
            </Typography>
            <ToggleButtonGroup
              value={form.video_source}
              exclusive
              onChange={(_, val) => val && setForm(prev => ({ ...prev, video_source: val }))}
              size="small"
              sx={{ mb: 1 }}
            >
              <ToggleButton value="youtube" sx={{ textTransform: 'none', fontSize: '0.8rem', fontWeight: 600 }}>
                <OndemandVideoOutlinedIcon sx={{ fontSize: '1rem', mr: 0.5 }} /> YouTube
              </ToggleButton>
              <ToggleButton value="sharepoint" sx={{ textTransform: 'none', fontSize: '0.8rem', fontWeight: 600 }}>
                <CloudOutlinedIcon sx={{ fontSize: '1rem', mr: 0.5 }} /> SharePoint
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {form.video_source === 'youtube' ? (
              <TextField
                label="YouTube Video ID"
                value={form.youtube_video_id}
                onChange={(e) => setForm(prev => ({ ...prev, youtube_video_id: e.target.value }))}
                size="small"
                sx={{ flex: 1, minWidth: 180 }}
              />
            ) : (
              <TextField
                label="SharePoint Video URL"
                placeholder="Paste the video URL from SharePoint"
                value={form.sharepoint_video_url}
                onChange={(e) => setForm(prev => ({ ...prev, sharepoint_video_url: e.target.value }))}
                size="small"
                sx={{ flex: 1, minWidth: 180 }}
                helperText="Copy the video link from SharePoint/Stream"
              />
            )}
            <TextField
              label="Sort Order"
              type="number"
              value={form.chapter_number}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setForm(prev => ({ ...prev, chapter_number: isNaN(val) ? 0 : val }));
              }}
              size="small"
              sx={{ width: 100 }}
              inputProps={{ min: 0 }}
            />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Switch
              checked={form.is_published}
              onChange={(e) => setForm(prev => ({ ...prev, is_published: e.target.checked }))}
              size="small"
            />
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {form.is_published ? 'Published (visible to students)' : 'Draft (hidden from students)'}
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Video Preview */}
      {form.video_source === 'youtube' && form.youtube_video_id && (
        <Paper elevation={0} sx={{ borderRadius: 2.5, border: `1px solid ${theme.palette.divider}`, mb: 2, overflow: 'hidden' }}>
          <Box sx={{ position: 'relative', width: '100%', pt: '56.25%', bgcolor: '#000' }}>
            <Box
              ref={playerContainerRef}
              sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
            />
          </Box>
          <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1, bgcolor: alpha(theme.palette.primary.main, 0.02) }}>
            <AccessTimeIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />
            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {formatTime(currentTime)}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
              {form.video_duration_seconds ? `/ ${formatTime(form.video_duration_seconds)}` : ''}
            </Typography>
          </Box>
        </Paper>
      )}
      {form.video_source === 'sharepoint' && form.sharepoint_video_url && (
        <Paper elevation={0} sx={{ borderRadius: 2.5, border: `1px solid ${theme.palette.divider}`, mb: 2, overflow: 'hidden' }}>
          <Box sx={{ position: 'relative', width: '100%', pt: '56.25%', bgcolor: '#000' }}>
            <Box sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
              <iframe
                src={toEmbedUrl(form.sharepoint_video_url)}
                style={{ width: '100%', height: '100%', border: 'none' }}
                allow="autoplay; encrypted-media; fullscreen"
                allowFullScreen
                title="SharePoint Preview"
              />
            </Box>
          </Box>
          <Box sx={{ px: 2, py: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.02) }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              SharePoint video — enter section timestamps manually (mm:ss) below
            </Typography>
          </Box>
        </Paper>
      )}

      {/* Sections */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Sections ({sections.length})
        </Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => setAddSectionOpen(true)}
          sx={{ textTransform: 'none' }}
        >
          Add Section
        </Button>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {sections.map((section, idx) => {
          const isExpanded = expandedSection === section.id;
          const questions = sectionQuestions[section.id] || [];

          return (
            <Paper
              key={section.id}
              elevation={0}
              sx={{
                borderRadius: 2,
                border: `1px solid ${isExpanded ? theme.palette.primary.main : theme.palette.divider}`,
                overflow: 'hidden',
              }}
            >
              {/* Section header */}
              <Box
                sx={{
                  p: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  cursor: 'pointer',
                  '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.02) },
                }}
                onClick={() => handleExpandSection(section.id)}
              >
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                    color: theme.palette.primary.main,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    flexShrink: 0,
                  }}
                >
                  {form.chapter_number}{String.fromCharCode(65 + idx)}
                </Box>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }} noWrap>
                    {section.title}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
                    {formatTime(section.start_timestamp_seconds)} – {formatTime(section.end_timestamp_seconds)}
                  </Typography>
                </Box>

                <Chip
                  label={
                    section.question_count > 0
                      ? section.min_questions_to_pass
                        ? `${section.question_count}Q (${section.min_questions_to_pass} to pass)`
                        : `${section.question_count}Q (all to pass)`
                      : '0 Q'
                  }
                  size="small"
                  sx={{
                    height: 22,
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    bgcolor: section.question_count > 0
                      ? alpha(theme.palette.success.main, 0.1)
                      : alpha(theme.palette.warning.main, 0.1),
                    color: section.question_count > 0
                      ? theme.palette.success.main
                      : theme.palette.warning.main,
                  }}
                />

                {form.video_source === 'youtube' && (
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); seekTo(section.start_timestamp_seconds); }}
                    sx={{ color: 'text.secondary' }}
                  >
                    <PlayArrowIcon fontSize="small" />
                  </IconButton>
                )}

                {isExpanded ? <ExpandLessIcon sx={{ color: 'text.secondary' }} /> : <ExpandMoreIcon sx={{ color: 'text.secondary' }} />}
              </Box>

              {/* Expanded section content */}
              <Collapse in={isExpanded}>
                <Divider />
                <Box sx={{ p: 2 }}>
                  {/* Section actions */}
                  <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        setNewQuestion({ question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: 'a', explanation: '' });
                        setAddQuestionSection(section.id);
                      }}
                      startIcon={<AddIcon />}
                      sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                    >
                      Add Question
                    </Button>
                    {section.question_count > 0 && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                          Pass with
                        </Typography>
                        <TextField
                          type="number"
                          size="small"
                          value={section.min_questions_to_pass ?? ''}
                          placeholder="All"
                          onChange={async (e) => {
                            const val = e.target.value ? parseInt(e.target.value) : null;
                            const clamped = val !== null ? Math.max(1, Math.min(val, section.question_count)) : null;
                            // Update local state immediately
                            setSections(prev => prev.map(s =>
                              s.id === section.id ? { ...s, min_questions_to_pass: clamped } : s
                            ));
                            // Save to server
                            try {
                              const token = await getToken();
                              if (!token) return;
                              await fetch(`/api/modules/${moduleId}/items/${itemId}/sections/${section.id}`, {
                                method: 'PATCH',
                                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ min_questions_to_pass: clamped }),
                              });
                            } catch (err) {
                              console.error('Failed to update pass criteria:', err);
                            }
                          }}
                          sx={{ width: 60, '& input': { textAlign: 'center', py: 0.5, fontSize: '0.8rem' } }}
                          inputProps={{ min: 1, max: section.question_count }}
                        />
                        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                          / {section.question_count} correct
                        </Typography>
                      </Box>
                    )}
                    <Button
                      size="small"
                      color="error"
                      onClick={() => handleDeleteSection(section.id)}
                      startIcon={<DeleteOutlineIcon />}
                      sx={{ textTransform: 'none', fontSize: '0.75rem', ml: 'auto' }}
                    >
                      Delete Section
                    </Button>
                  </Box>

                  {/* Questions list */}
                  {loadingQuestions === section.id ? (
                    <Skeleton variant="rectangular" height={40} sx={{ borderRadius: 1 }} />
                  ) : questions.length === 0 ? (
                    <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                      No quiz questions yet. Add at least 2-3 questions for this section.
                    </Typography>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {questions.map((q, qi) => (
                        <Paper
                          key={q.id}
                          variant="outlined"
                          sx={{ p: 1.5, borderRadius: 1.5 }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: theme.palette.primary.main, mt: 0.25 }}>
                              Q{qi + 1}
                            </Typography>
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500, mb: 0.5 }}>
                                {q.question_text}
                              </Typography>
                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                {(['a', 'b', 'c', 'd'] as const).map(opt => (
                                  <Chip
                                    key={opt}
                                    label={`${opt.toUpperCase()}: ${q[`option_${opt}`]}`}
                                    size="small"
                                    sx={{
                                      height: 22,
                                      fontSize: '0.65rem',
                                      maxWidth: 200,
                                      bgcolor: q.correct_option === opt
                                        ? alpha(theme.palette.success.main, 0.1)
                                        : 'transparent',
                                      border: q.correct_option === opt
                                        ? `1px solid ${alpha(theme.palette.success.main, 0.3)}`
                                        : `1px solid ${theme.palette.divider}`,
                                    }}
                                  />
                                ))}
                              </Box>
                            </Box>
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteQuestion(q.id, section.id)}
                              sx={{ color: 'text.disabled', '&:hover': { color: theme.palette.error.main } }}
                            >
                              <DeleteOutlineIcon sx={{ fontSize: '1rem' }} />
                            </IconButton>
                          </Box>
                        </Paper>
                      ))}
                    </Box>
                  )}
                </Box>
              </Collapse>
            </Paper>
          );
        })}
      </Box>

      {/* Add Section Dialog */}
      <Dialog open={addSectionOpen} onClose={() => setAddSectionOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Add Section</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Section Title"
              value={newSection.title}
              onChange={(e) => setNewSection(prev => ({ ...prev, title: e.target.value }))}
              fullWidth
              size="small"
            />
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              Start Time {playerReady && form.video_source === 'youtube' && (
                <Button
                  size="small"
                  onClick={() => {
                    const t = playerRef.current?.getCurrentTime?.() || 0;
                    setNewSection(prev => ({ ...prev, start_min: Math.floor(t / 60), start_sec: Math.floor(t % 60) }));
                  }}
                  sx={{ textTransform: 'none', fontSize: '0.7rem', ml: 1, minWidth: 0, py: 0 }}
                >
                  Use current ({formatTime(currentTime)})
                </Button>
              )}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                label="Min"
                type="number"
                value={newSection.start_min}
                onChange={(e) => setNewSection(prev => ({ ...prev, start_min: parseInt(e.target.value) || 0 }))}
                size="small"
                sx={{ width: 80 }}
              />
              <TextField
                label="Sec"
                type="number"
                value={newSection.start_sec}
                onChange={(e) => setNewSection(prev => ({ ...prev, start_sec: Math.min(59, parseInt(e.target.value) || 0) }))}
                size="small"
                sx={{ width: 80 }}
              />
            </Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              End Time {playerReady && form.video_source === 'youtube' && (
                <Button
                  size="small"
                  onClick={() => {
                    const t = playerRef.current?.getCurrentTime?.() || 0;
                    setNewSection(prev => ({ ...prev, end_min: Math.floor(t / 60), end_sec: Math.floor(t % 60) }));
                  }}
                  sx={{ textTransform: 'none', fontSize: '0.7rem', ml: 1, minWidth: 0, py: 0 }}
                >
                  Use current ({formatTime(currentTime)})
                </Button>
              )}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                label="Min"
                type="number"
                value={newSection.end_min}
                onChange={(e) => setNewSection(prev => ({ ...prev, end_min: parseInt(e.target.value) || 0 }))}
                size="small"
                sx={{ width: 80 }}
              />
              <TextField
                label="Sec"
                type="number"
                value={newSection.end_sec}
                onChange={(e) => setNewSection(prev => ({ ...prev, end_sec: Math.min(59, parseInt(e.target.value) || 0) }))}
                size="small"
                sx={{ width: 80 }}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAddSectionOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAddSection}
            disabled={!newSection.title.trim()}
            sx={{ textTransform: 'none' }}
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Question Dialog */}
      <Dialog open={!!addQuestionSection} onClose={() => setAddQuestionSection(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Add Quiz Question</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Question"
              value={newQuestion.question_text}
              onChange={(e) => setNewQuestion(prev => ({ ...prev, question_text: e.target.value }))}
              fullWidth
              size="small"
              multiline
              rows={2}
            />
            <TextField
              label="Option A"
              value={newQuestion.option_a}
              onChange={(e) => setNewQuestion(prev => ({ ...prev, option_a: e.target.value }))}
              fullWidth
              size="small"
            />
            <TextField
              label="Option B"
              value={newQuestion.option_b}
              onChange={(e) => setNewQuestion(prev => ({ ...prev, option_b: e.target.value }))}
              fullWidth
              size="small"
            />
            <TextField
              label="Option C"
              value={newQuestion.option_c}
              onChange={(e) => setNewQuestion(prev => ({ ...prev, option_c: e.target.value }))}
              fullWidth
              size="small"
            />
            <TextField
              label="Option D"
              value={newQuestion.option_d}
              onChange={(e) => setNewQuestion(prev => ({ ...prev, option_d: e.target.value }))}
              fullWidth
              size="small"
            />
            <TextField
              select
              label="Correct Answer"
              value={newQuestion.correct_option}
              onChange={(e) => setNewQuestion(prev => ({ ...prev, correct_option: e.target.value as any }))}
              size="small"
              sx={{ width: 180 }}
            >
              <MenuItem value="a">Option A</MenuItem>
              <MenuItem value="b">Option B</MenuItem>
              <MenuItem value="c">Option C</MenuItem>
              <MenuItem value="d">Option D</MenuItem>
            </TextField>
            <TextField
              label="Explanation (optional)"
              value={newQuestion.explanation}
              onChange={(e) => setNewQuestion(prev => ({ ...prev, explanation: e.target.value }))}
              fullWidth
              size="small"
              multiline
              rows={2}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAddQuestionSection(null)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAddQuestion}
            disabled={
              !newQuestion.question_text.trim() || !newQuestion.option_a.trim() ||
              !newQuestion.option_b.trim() || !newQuestion.option_c.trim() || !newQuestion.option_d.trim()
            }
            sx={{ textTransform: 'none' }}
          >
            Add Question
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
