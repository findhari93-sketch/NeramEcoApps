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
} from '@neram/ui';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { NexusQBOriginalPaper, QBExamType, QBProgressStats } from '@neram/database';
import { QB_EXAM_TYPE_LABELS } from '@neram/database';
import QBPaperCard from '@/components/question-bank/QBPaperCard';

const EXAM_TABS: QBExamType[] = ['NATA', 'JEE_PAPER_2'];

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

      {/* Quick Actions */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
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
    </Box>
  );
}
