'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Button,
  Skeleton,
  Chip,
  IconButton,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { QB_EXAM_TYPE_LABELS } from '@neram/database';
import type { NexusQBOriginalPaper } from '@neram/database';
import PaperProgressBar from '@/components/question-bank/PaperProgressBar';

export default function PapersListPage() {
  const router = useRouter();
  const { getToken } = useNexusAuthContext();

  const [papers, setPapers] = useState<NexusQBOriginalPaper[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchPapers() {
      setLoading(true);
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
        if (!cancelled) setLoading(false);
      }
    }

    fetchPapers();
    return () => { cancelled = true; };
  }, [getToken]);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton size="small" onClick={() => router.push('/teacher/question-bank')}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" component="h1" fontWeight={700} sx={{ flex: 1 }}>
          Uploaded Papers
        </Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<UploadFileOutlinedIcon />}
          onClick={() => router.push('/teacher/question-bank/bulk-upload')}
        >
          Upload
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={100} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : papers.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <DescriptionOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            No papers uploaded yet
          </Typography>
          <Button
            variant="contained"
            startIcon={<UploadFileOutlinedIcon />}
            onClick={() => router.push('/teacher/question-bank/bulk-upload')}
          >
            Upload First Paper
          </Button>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {papers.map((paper) => {
            const total = paper.questions_parsed || 0;
            const keyed = paper.questions_answer_keyed || 0;
            const complete = paper.questions_complete || 0;
            const draft = total - keyed;
            const answerKeyedOnly = keyed - complete;

            return (
              <Paper
                key={paper.id}
                variant="outlined"
                sx={{
                  p: 2,
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
                onClick={() => router.push(`/teacher/question-bank/papers/${paper.id}`)}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Chip
                    label={QB_EXAM_TYPE_LABELS[paper.exam_type] || paper.exam_type}
                    size="small"
                    color="primary"
                  />
                  <Typography variant="subtitle1" fontWeight={600}>
                    {paper.year}
                  </Typography>
                  {paper.session && (
                    <Chip label={paper.session} size="small" variant="outlined" />
                  )}
                  <Box sx={{ flex: 1 }} />
                  <Typography variant="caption" color="text.secondary">
                    {formatDate(paper.created_at)}
                  </Typography>
                </Box>

                <Box sx={{ mb: 1 }}>
                  <PaperProgressBar
                    total={total}
                    draft={draft > 0 ? draft : 0}
                    answerKeyed={answerKeyedOnly > 0 ? answerKeyedOnly : 0}
                    complete={complete}
                    active={0}
                  />
                </Box>

                <Typography variant="caption" color="text.secondary">
                  {total} questions &middot; {keyed} with answers &middot; {complete} complete
                </Typography>
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
