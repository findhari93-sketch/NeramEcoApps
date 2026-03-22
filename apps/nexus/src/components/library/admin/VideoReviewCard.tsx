'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Button,
  IconButton,
  Checkbox,
  alpha,
  useTheme,
  useMediaQuery,
  CircularProgress,
} from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SkipNextOutlinedIcon from '@mui/icons-material/SkipNextOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

interface LibraryVideo {
  id: string;
  youtube_video_id: string;
  original_title: string | null;
  youtube_thumbnail_url: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  transcript_status: string;
  suggested_title: string | null;
  category: string | null;
  subcategories: string[];
  exam: string | null;
  language: string | null;
  difficulty: string | null;
  topics: string[];
  ai_confidence: number | null;
  review_status: string;
}

interface VideoReviewCardProps {
  video: LibraryVideo;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onAction: (id: string, action: 'approve' | 'reject' | 'skip', updates?: Record<string, unknown>) => Promise<void>;
}

const CATEGORY_OPTIONS: Record<string, string[]> = {
  drawing: ['freehand_sketching', 'perspective_drawing', '2d_composition', '3d_composition', 'figure_drawing', 'object_drawing', 'memory_drawing', 'color_composition', 'design_elements', 'architectural_drawing'],
  aptitude: ['spatial_reasoning', 'visual_perception', 'pattern_recognition', 'mental_rotation', 'logical_reasoning'],
  mathematics: ['algebra', 'trigonometry', 'calculus', 'geometry', 'statistics', 'coordinate_geometry'],
  general_knowledge: ['architecture_history', 'current_affairs', 'famous_architects', 'sustainability', 'building_materials'],
  exam_preparation: ['mock_test_review', 'time_management', 'exam_strategy', 'previous_papers'],
  orientation: ['course_intro', 'career_guidance', 'institution_overview'],
};

const EXAM_OPTIONS = ['nata', 'jee_barch', 'both', 'general'];
const LANGUAGE_OPTIONS = ['ta', 'en', 'ta_en'];
const DIFFICULTY_OPTIONS = ['beginner', 'intermediate', 'advanced', 'mixed'];

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getTranscriptBadge(status: string) {
  switch (status) {
    case 'fetched':
      return { color: '#4caf50', label: 'Fetched' };
    case 'pending':
      return { color: '#ff9800', label: 'Pending' };
    case 'error':
    case 'unavailable':
      return { color: '#f44336', label: status === 'error' ? 'Error' : 'Unavailable' };
    default:
      return { color: '#9e9e9e', label: status };
  }
}

function getConfidenceBadge(confidence: number | null) {
  if (confidence === null) return { color: '#9e9e9e', label: 'N/A' };
  if (confidence >= 0.85) return { color: '#4caf50', label: `${Math.round(confidence * 100)}%` };
  if (confidence >= 0.5) return { color: '#ff9800', label: `${Math.round(confidence * 100)}%` };
  return { color: '#f44336', label: `${Math.round(confidence * 100)}%` };
}

export default function VideoReviewCard({ video, selected, onSelect, onAction }: VideoReviewCardProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [expanded, setExpanded] = useState(!isMobile);
  const [title, setTitle] = useState(video.suggested_title || video.original_title || '');
  const [category, setCategory] = useState(video.category || '');
  const [subcategory, setSubcategory] = useState(video.subcategories?.[0] || '');
  const [exam, setExam] = useState(video.exam || '');
  const [language, setLanguage] = useState(video.language || '');
  const [difficulty, setDifficulty] = useState(video.difficulty || '');
  const [topics, setTopics] = useState<string[]>(video.topics || []);
  const [newTopic, setNewTopic] = useState('');
  const [acting, setActing] = useState(false);

  const transcriptBadge = getTranscriptBadge(video.transcript_status);
  const confidenceBadge = getConfidenceBadge(video.ai_confidence);

  const subcategoryOptions = CATEGORY_OPTIONS[category] || [];

  const handleAction = async (action: 'approve' | 'reject' | 'skip') => {
    setActing(true);
    try {
      const updates: Record<string, unknown> = {};
      if (action === 'approve') {
        updates.review_status = 'approved';
        updates.is_published = true;
        updates.approved_title = title;
        updates.category = category || null;
        updates.subcategories = subcategory ? [subcategory] : [];
        updates.exam = exam || null;
        updates.language = language || null;
        updates.difficulty = difficulty || null;
        updates.topics = topics;
      } else if (action === 'reject') {
        updates.review_status = 'rejected';
        updates.is_published = false;
      }
      await onAction(video.id, action, updates);
    } finally {
      setActing(false);
    }
  };

  const handleAddTopic = () => {
    const t = newTopic.trim();
    if (t && !topics.includes(t)) {
      setTopics([...topics, t]);
      setNewTopic('');
    }
  };

  const handleRemoveTopic = (topic: string) => {
    setTopics(topics.filter((t) => t !== topic));
  };

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 1.5, sm: 2 },
        borderRadius: 2,
        border: `1px solid ${selected ? theme.palette.primary.main : theme.palette.divider}`,
        bgcolor: selected ? alpha(theme.palette.primary.main, 0.02) : 'background.paper',
        transition: 'border-color 200ms ease',
      }}
    >
      {/* Top row: checkbox + thumbnail + basic info */}
      <Box sx={{ display: 'flex', gap: { xs: 1, sm: 1.5 }, alignItems: 'flex-start' }}>
        <Checkbox
          checked={selected}
          onChange={(e) => onSelect(video.id, e.target.checked)}
          size="small"
          sx={{ p: 0.5, mt: 0.25 }}
        />

        {/* Thumbnail */}
        <Box
          component="img"
          src={video.youtube_thumbnail_url || `https://img.youtube.com/vi/${video.youtube_video_id}/mqdefault.jpg`}
          alt={video.original_title || 'Video thumbnail'}
          sx={{
            width: { xs: 80, sm: 120 },
            height: { xs: 45, sm: 68 },
            objectFit: 'cover',
            borderRadius: 1,
            flexShrink: 0,
          }}
        />

        {/* Info */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              fontSize: '0.8rem',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              mb: 0.5,
            }}
          >
            {video.original_title || 'Untitled Video'}
          </Typography>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              {formatDuration(video.duration_seconds)}
            </Typography>
            {video.published_at && (
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                {new Date(video.published_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Typography>
            )}
            <Chip
              label={transcriptBadge.label}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.6rem',
                fontWeight: 600,
                bgcolor: alpha(transcriptBadge.color, 0.1),
                color: transcriptBadge.color,
              }}
            />
            <Chip
              label={`AI: ${confidenceBadge.label}`}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.6rem',
                fontWeight: 600,
                bgcolor: alpha(confidenceBadge.color, 0.1),
                color: confidenceBadge.color,
              }}
            />
          </Box>
        </Box>

        {isMobile && (
          <IconButton size="small" onClick={() => setExpanded(!expanded)} sx={{ mt: -0.5 }}>
            {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        )}
      </Box>

      {/* Expandable edit fields */}
      {expanded && (
        <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <TextField
            label="Suggested Title"
            size="small"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
            sx={{ '& .MuiInputBase-root': { fontSize: '0.85rem' } }}
          />

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <FormControl size="small" sx={{ minWidth: 130, flex: 1 }}>
              <InputLabel sx={{ fontSize: '0.8rem' }}>Category</InputLabel>
              <Select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as string);
                  setSubcategory('');
                }}
                label="Category"
                sx={{ fontSize: '0.8rem' }}
              >
                <MenuItem value="">None</MenuItem>
                {Object.keys(CATEGORY_OPTIONS).map((cat) => (
                  <MenuItem key={cat} value={cat} sx={{ fontSize: '0.8rem' }}>
                    {cat.replace(/_/g, ' ')}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 130, flex: 1 }}>
              <InputLabel sx={{ fontSize: '0.8rem' }}>Subcategory</InputLabel>
              <Select
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value as string)}
                label="Subcategory"
                disabled={subcategoryOptions.length === 0}
                sx={{ fontSize: '0.8rem' }}
              >
                <MenuItem value="">None</MenuItem>
                {subcategoryOptions.map((sub) => (
                  <MenuItem key={sub} value={sub} sx={{ fontSize: '0.8rem' }}>
                    {sub.replace(/_/g, ' ')}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <FormControl size="small" sx={{ minWidth: 100, flex: 1 }}>
              <InputLabel sx={{ fontSize: '0.8rem' }}>Exam</InputLabel>
              <Select
                value={exam}
                onChange={(e) => setExam(e.target.value as string)}
                label="Exam"
                sx={{ fontSize: '0.8rem' }}
              >
                <MenuItem value="">None</MenuItem>
                {EXAM_OPTIONS.map((e) => (
                  <MenuItem key={e} value={e} sx={{ fontSize: '0.8rem' }}>
                    {e.replace(/_/g, ' ').toUpperCase()}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 100, flex: 1 }}>
              <InputLabel sx={{ fontSize: '0.8rem' }}>Language</InputLabel>
              <Select
                value={language}
                onChange={(e) => setLanguage(e.target.value as string)}
                label="Language"
                sx={{ fontSize: '0.8rem' }}
              >
                <MenuItem value="">None</MenuItem>
                {LANGUAGE_OPTIONS.map((l) => (
                  <MenuItem key={l} value={l} sx={{ fontSize: '0.8rem' }}>
                    {l === 'ta' ? 'Tamil' : l === 'en' ? 'English' : 'Tamil + English'}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 100, flex: 1 }}>
              <InputLabel sx={{ fontSize: '0.8rem' }}>Difficulty</InputLabel>
              <Select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as string)}
                label="Difficulty"
                sx={{ fontSize: '0.8rem' }}
              >
                <MenuItem value="">None</MenuItem>
                {DIFFICULTY_OPTIONS.map((d) => (
                  <MenuItem key={d} value={d} sx={{ fontSize: '0.8rem', textTransform: 'capitalize' }}>
                    {d}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {/* Topics */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.7rem', mb: 0.5, display: 'block' }}>
              Topics
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.75 }}>
              {topics.map((topic) => (
                <Chip
                  key={topic}
                  label={topic}
                  size="small"
                  onDelete={() => handleRemoveTopic(topic)}
                  sx={{ height: 24, fontSize: '0.7rem' }}
                />
              ))}
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              <TextField
                size="small"
                placeholder="Add topic..."
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTopic();
                  }
                }}
                sx={{
                  flex: 1,
                  '& .MuiInputBase-root': { fontSize: '0.8rem', height: 32 },
                }}
              />
              <IconButton size="small" onClick={handleAddTopic} disabled={!newTopic.trim()}>
                <AddCircleOutlineIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        </Box>
      )}

      {/* Action buttons */}
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          mt: 1.5,
          justifyContent: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        <Button
          size="small"
          variant="outlined"
          color="error"
          onClick={() => handleAction('reject')}
          disabled={acting}
          startIcon={<CancelOutlinedIcon sx={{ fontSize: '0.9rem !important' }} />}
          sx={{ textTransform: 'none', fontSize: '0.75rem', borderRadius: 1.5, minHeight: 32 }}
        >
          Reject
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={() => handleAction('skip')}
          disabled={acting}
          startIcon={<SkipNextOutlinedIcon sx={{ fontSize: '0.9rem !important' }} />}
          sx={{ textTransform: 'none', fontSize: '0.75rem', borderRadius: 1.5, minHeight: 32 }}
        >
          Skip
        </Button>
        <Button
          size="small"
          variant="outlined"
          color="primary"
          onClick={() => {
            if (!expanded) setExpanded(true);
          }}
          disabled={acting}
          startIcon={<EditOutlinedIcon sx={{ fontSize: '0.9rem !important' }} />}
          sx={{
            textTransform: 'none',
            fontSize: '0.75rem',
            borderRadius: 1.5,
            minHeight: 32,
            display: expanded ? 'none' : 'inline-flex',
          }}
        >
          Edit
        </Button>
        <Button
          size="small"
          variant="contained"
          color="success"
          onClick={() => handleAction('approve')}
          disabled={acting}
          startIcon={
            acting ? (
              <CircularProgress size={14} sx={{ color: '#fff' }} />
            ) : (
              <CheckCircleOutlineIcon sx={{ fontSize: '0.9rem !important' }} />
            )
          }
          sx={{
            textTransform: 'none',
            fontSize: '0.75rem',
            borderRadius: 1.5,
            fontWeight: 600,
            minHeight: 32,
            px: 2,
            boxShadow: 'none',
          }}
        >
          Approve
        </Button>
      </Box>
    </Paper>
  );
}
