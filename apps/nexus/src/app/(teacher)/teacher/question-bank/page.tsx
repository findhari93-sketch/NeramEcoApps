'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Switch,
  Button,
  Skeleton,
  Tab,
  Tabs,
  Card,
  CardActionArea,
  Alert,
} from '@neram/ui';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import SellOutlinedIcon from '@mui/icons-material/SellOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import ChevronRightOutlinedIcon from '@mui/icons-material/ChevronRightOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { NexusQBOriginalPaper, QBExamType, QBProgressStats } from '@neram/database';
import { QB_EXAM_TYPE_LABELS } from '@neram/database';
import QBPaperCard from '@/components/question-bank/QBPaperCard';

const EXAM_TABS: QBExamType[] = ['NATA', 'JEE_PAPER_2'];

/**
 * The rest of the section, in one place.
 *
 * Every route here existed and had no door: the only way in was a typed URL or
 * a bookmark, so the work they do (bulk solutions, re-classification, reported
 * questions) looked like it did not exist. They sit below the papers rather than
 * beside the four main cards because they are occasional jobs, not daily ones.
 */
const MORE_TOOLS: { label: string; desc: string; href: string }[] = [
  {
    label: 'Manage papers',
    desc: 'Publish, activate questions, delete',
    href: '/teacher/question-bank/papers',
  },
  {
    label: 'Student progress',
    desc: 'Who has read, practised and sat each paper',
    href: '/teacher/question-bank/papers/overview',
  },
  {
    label: 'Bulk solutions',
    desc: 'Upload explanations for many questions',
    href: '/teacher/question-bank/solutions',
  },
  {
    label: 'Drawing questions',
    desc: 'Prompts, references and marking notes',
    href: '/teacher/question-bank/drawing-management',
  },
  {
    label: 'Import recalled',
    desc: 'Turn recalled questions into bank entries',
    href: '/teacher/question-bank/recalled-import',
  },
  {
    label: 'Re-classify topics',
    desc: 'Move questions between categories in bulk',
    href: '/teacher/question-bank/reclassify',
  },
  {
    label: 'Reported questions',
    desc: 'What students flagged as wrong',
    href: '/teacher/question-bank/reports',
  },
];

/** The hub's primary destinations, surfaced as cards so nothing is an orphan route. */
const HUB_LINKS: {
  key: string;
  label: string;
  desc: string;
  href: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  {
    key: 'questions',
    label: 'Questions',
    desc: 'Browse, filter and tag everything',
    href: '/teacher/question-bank/questions',
    icon: <QuizOutlinedIcon />,
    color: '#6366F1',
  },
  {
    key: 'tags',
    label: 'Tags and themes',
    desc: 'The taxonomy, and what is tagged with it',
    href: '/teacher/question-bank/tags',
    icon: <SellOutlinedIcon />,
    color: '#F59E0B',
  },
  {
    // Recall is a sidebar feature in its own right. This card used to point at
    // /teacher/questions, a separate system with its own tables that never
    // received a single submission and titled itself "Question Bank" too.
    key: 'recall',
    label: 'Student exam recall',
    desc: 'Questions students remembered after an exam',
    href: '/teacher/exam-recall',
    icon: <RateReviewOutlinedIcon />,
    color: '#10B981',
  },
  {
    key: 'tagging',
    label: 'Tagging assistant',
    desc: 'Bulk-tag questions with AI help',
    href: '/teacher/question-bank/tagging-assistant',
    icon: <AutoAwesomeOutlinedIcon />,
    color: '#8B5CF6',
  },
];

export default function QuestionBankDashboard() {
  const router = useRouter();
  const { activeClassroom, getToken } = useNexusAuthContext();

  const [qbEnabled, setQbEnabled] = useState(false);
  const [qbLoading, setQbLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const [stats, setStats] = useState<QBProgressStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [papers, setPapers] = useState<NexusQBOriginalPaper[]>([]);
  const [papersLoading, setPapersLoading] = useState(true);

  const [selectedExam, setSelectedExam] = useState<QBExamType>('NATA');

  const [publishing, setPublishing] = useState(false);
  const [publishNotice, setPublishNotice] = useState<string | null>(null);

  // Fetch QB enabled status
  useEffect(() => {
    if (!activeClassroom) return;
    let cancelled = false;

    async function fetchLink() {
      setQbLoading(true);
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const res = await fetch(
          `/api/question-bank/classroom-link?classroom_id=${activeClassroom!.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setQbEnabled(json.data?.enabled ?? false);
        }
      } catch (err) {
        console.error('Failed to fetch QB link:', err);
      } finally {
        if (!cancelled) setQbLoading(false);
      }
    }

    fetchLink();
    return () => { cancelled = true; };
  }, [activeClassroom, getToken]);

  // Fetch stats
  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      setStatsLoading(true);
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const res = await fetch('/api/question-bank/stats', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setStats(json.data);
        }
      } catch (err) {
        console.error('Failed to fetch QB stats:', err);
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    }

    fetchStats();
    return () => { cancelled = true; };
  }, [getToken]);

  // Fetch papers
  useEffect(() => {
    let cancelled = false;

    async function fetchPapers() {
      setPapersLoading(true);
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const res = await fetch('/api/question-bank/papers', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setPapers(json.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch papers:', err);
      } finally {
        if (!cancelled) setPapersLoading(false);
      }
    }

    fetchPapers();
    return () => { cancelled = true; };
  }, [getToken]);

  async function handleToggle() {
    if (!activeClassroom) return;
    setToggling(true);
    try {
      const token = await getToken();
      if (!token) return;

      const newEnabled = !qbEnabled;
      const method = newEnabled ? 'POST' : 'DELETE';
      const res = await fetch('/api/question-bank/classroom-link', {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ classroom_id: activeClassroom.id }),
      });
      if (res.ok) {
        setQbEnabled(newEnabled);
      }
    } catch (err) {
      console.error('Failed to toggle QB:', err);
    } finally {
      setToggling(false);
    }
  }

  /**
   * Papers ready to publish but not yet published. Drives the nudge below: the
   * parse status chips look like completion, so without this a fully parsed bank
   * can sit invisible to students indefinitely.
   */
  const unpublishedReady = useMemo(
    () =>
      papers.filter(
        (p) => !p.is_student_visible && ((p.questions_parsed || 0) > 0 || !!p.study_file_id),
      ).length,
    [papers],
  );

  async function handlePublishAll() {
    setPublishing(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/question-bank/papers/bulk-publish', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) {
        setPublishNotice(json.error || 'Could not publish the papers.');
        return;
      }
      const { published, skipped } = json.data as {
        published: number;
        skipped: { id: string; label: string }[];
      };
      setPapers((prev) =>
        prev.map((p) =>
          !p.is_student_visible && ((p.questions_parsed || 0) > 0 || !!p.study_file_id)
            ? { ...p, is_student_visible: true }
            : p,
        ),
      );
      setPublishNotice(
        `${published} paper${published !== 1 ? 's' : ''} published.` +
          (skipped.length > 0
            ? ` ${skipped.length} still need questions or a PDF: ${skipped
                .slice(0, 3)
                .map((s) => s.label)
                .join(', ')}${skipped.length > 3 ? ` and ${skipped.length - 3} more` : ''}.`
            : ''),
      );
    } catch {
      setPublishNotice('Could not publish the papers.');
    } finally {
      setPublishing(false);
    }
  }

  // Group papers by exam type for tab counts
  const paperCountByExam = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of papers) {
      counts[p.exam_type] = (counts[p.exam_type] || 0) + 1;
    }
    return counts;
  }, [papers]);

  // Filter and group papers by year for the selected exam tab
  const papersByYear = useMemo(() => {
    const filtered = papers.filter((p) => p.exam_type === selectedExam);
    const grouped: Record<number, NexusQBOriginalPaper[]> = {};
    for (const p of filtered) {
      if (!grouped[p.year]) grouped[p.year] = [];
      grouped[p.year].push(p);
    }
    // Sort years descending
    return Object.entries(grouped)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([year, yearPapers]) => ({ year: Number(year), papers: yearPapers }));
  }, [papers, selectedExam]);

  // Compute total questions with solutions from stats
  const totalQuestions = stats?.total_questions ?? 0;
  const withSolutions = stats?.attempted_count ?? 0;

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
      {/* Header Row: Title + Toggle */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700, flex: 1 }}>
          Question Bank
        </Typography>
        {qbLoading ? (
          <Skeleton variant="rectangular" width={52} height={28} sx={{ borderRadius: 7 }} />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
              {qbEnabled ? 'Enabled' : 'Off'}
            </Typography>
            <Switch
              size="small"
              checked={qbEnabled}
              onChange={handleToggle}
              disabled={toggling || !activeClassroom}
            />
          </Box>
        )}
      </Box>

      {/* Subtitle Row: Status + Compact Stats */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: { xs: 0.5, sm: 2 },
          mb: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {activeClassroom?.name || 'Classroom'} &middot;{' '}
          {qbEnabled ? 'Students can access' : 'Disabled for students'}
        </Typography>
        {statsLoading ? (
          <Skeleton variant="text" width={160} />
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
            {totalQuestions} questions{withSolutions > 0 ? ` · ${withSolutions} with solutions` : ''}
          </Typography>
        )}
      </Box>

      {/* Tests moved out of the Question Bank into their own section */}
      <Card
        variant="outlined"
        sx={{ borderRadius: 2, mb: 1.5, transition: 'border-color 150ms', '&:hover': { borderColor: 'primary.main' } }}
      >
        <CardActionArea
          onClick={() => router.push('/teacher/tests')}
          aria-label="Open the Tests section"
          sx={{ p: 1.25, display: 'flex', alignItems: 'center', gap: 1, minHeight: 48 }}
        >
          <FactCheckOutlinedIcon color="primary" sx={{ fontSize: 20 }} />
          <Typography variant="body2" sx={{ flex: 1, fontWeight: 600 }}>
            Looking for tests? Build and manage them in the Tests section.
          </Typography>
          <ChevronRightOutlinedIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
        </CardActionArea>
      </Card>

      {/* Hub destinations (previously orphaned routes now reachable) */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
          gap: { xs: 1, sm: 1.5 },
          mb: 2.5,
        }}
      >
        {HUB_LINKS.map((link) => (
          <Card
            key={link.key}
            variant="outlined"
            sx={{
              borderRadius: 2,
              transition: 'border-color 150ms, box-shadow 150ms',
              '&:hover': { borderColor: link.color, boxShadow: 2 },
            }}
          >
            <CardActionArea
              onClick={() => router.push(link.href)}
              aria-label={`${link.label}. ${link.desc}`}
              sx={{ p: 1.5, height: '100%', minHeight: 96, alignItems: 'flex-start' }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: `${link.color}1A`,
                    color: link.color,
                    '& svg': { fontSize: 20 },
                  }}
                >
                  {link.icon}
                </Box>
                <ChevronRightOutlinedIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
              </Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                {link.label}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                {link.desc}
              </Typography>
            </CardActionArea>
          </Card>
        ))}
      </Box>

      {/* Publishing is separate from parsing, and easy to forget. Say so here. */}
      {!papersLoading && unpublishedReady > 0 && (
        <Alert
          severity="info"
          icon={<VisibilityOffOutlinedIcon />}
          action={
            <Button
              size="small"
              variant="contained"
              disabled={publishing}
              onClick={handlePublishAll}
              sx={{ textTransform: 'none', minHeight: 36, whiteSpace: 'nowrap' }}
            >
              {publishing ? 'Publishing...' : 'Publish all ready'}
            </Button>
          }
          sx={{ mb: 2, alignItems: 'center', '& .MuiAlert-action': { alignItems: 'center', pt: 0 } }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {unpublishedReady} paper{unpublishedReady !== 1 ? 's are' : ' is'} ready but not published
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Students see nothing here until a paper is published. Parsing status is not publishing.
          </Typography>
        </Alert>
      )}

      {publishNotice && (
        <Alert severity="success" onClose={() => setPublishNotice(null)} sx={{ mb: 2 }}>
          {publishNotice}
        </Alert>
      )}

      {/* Papers browse */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          mb: 1,
        }}
      >
        <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1, fontWeight: 700 }}>
          Original papers
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddOutlinedIcon />}
            onClick={() => router.push('/teacher/question-bank/new')}
            sx={{ textTransform: 'none' }}
          >
            Add Question
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<UploadFileOutlinedIcon />}
            onClick={() => router.push('/teacher/question-bank/bulk-upload')}
            sx={{ textTransform: 'none' }}
          >
            Bulk Upload
          </Button>
        </Box>
      </Box>

      {/* Exam Tabs */}
      <Tabs
        value={selectedExam}
        onChange={(_, v) => setSelectedExam(v as QBExamType)}
        variant="fullWidth"
        sx={{
          mb: 2,
          borderBottom: 1,
          borderColor: 'divider',
          minHeight: 40,
          '& .MuiTab-root': { minHeight: 40, textTransform: 'none', fontWeight: 600 },
        }}
      >
        {EXAM_TABS.map((exam) => (
          <Tab
            key={exam}
            value={exam}
            label={`${QB_EXAM_TYPE_LABELS[exam] || exam} (${paperCountByExam[exam] || 0})`}
          />
        ))}
      </Tabs>

      {/* Papers List */}
      {papersLoading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : papersByYear.length === 0 ? (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <DescriptionOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            No papers uploaded for {QB_EXAM_TYPE_LABELS[selectedExam] || selectedExam} yet
          </Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={<UploadFileOutlinedIcon />}
            onClick={() => router.push('/teacher/question-bank/bulk-upload')}
            sx={{ textTransform: 'none' }}
          >
            Upload Paper
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {papersByYear.map(({ year, papers: yearPapers }) => (
            <Box key={year}>
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ mb: 0.5, display: 'block', letterSpacing: 1 }}
              >
                {year}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {yearPapers.map((paper) => (
                  <QBPaperCard
                    key={paper.id}
                    paper={paper}
                    onClick={() => router.push(`/teacher/question-bank/papers/${paper.id}`)}
                  />
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* Everything else this section can do, with a door at last. */}
      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ letterSpacing: 1, fontWeight: 700, display: 'block', mt: 4, mb: 1 }}
      >
        More tools
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' },
          gap: 1,
        }}
      >
        {MORE_TOOLS.map((tool) => (
          <Card key={tool.href} variant="outlined" sx={{ borderRadius: 2 }}>
            <CardActionArea
              onClick={() => router.push(tool.href)}
              aria-label={`${tool.label}. ${tool.desc}`}
              sx={{ px: 1.5, py: 1.25, minHeight: 56, display: 'flex', alignItems: 'center', gap: 1 }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                  {tool.label}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {tool.desc}
                </Typography>
              </Box>
              <ChevronRightOutlinedIcon sx={{ fontSize: 18, color: 'text.disabled', flexShrink: 0 }} />
            </CardActionArea>
          </Card>
        ))}
      </Box>
    </Box>
  );
}
