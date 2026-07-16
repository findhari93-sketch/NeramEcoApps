'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Skeleton,
  Chip,
  Paper,
  Collapse,
} from '@neram/ui';
import AddTaskOutlinedIcon from '@mui/icons-material/AddTaskOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import VideoLibraryOutlinedIcon from '@mui/icons-material/VideoLibraryOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import ViewModuleOutlinedIcon from '@mui/icons-material/ViewModuleOutlined';
import ClassOutlinedIcon from '@mui/icons-material/ClassOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { NexusTestOverviewGroup, NexusTestOverviewGroupKey, NexusOverviewTest } from '@neram/database';

const GROUP_META: Record<NexusTestOverviewGroupKey, { icon: React.ReactNode; color: string }> = {
  study_materials: { icon: <MenuBookOutlinedIcon />, color: '#0EA5E9' },
  class_recaps: { icon: <VideoLibraryOutlinedIcon />, color: '#8B5CF6' },
  foundation: { icon: <SchoolOutlinedIcon />, color: '#10B981' },
  modules: { icon: <ViewModuleOutlinedIcon />, color: '#F59E0B' },
  classroom: { icon: <ClassOutlinedIcon />, color: '#6366F1' },
  practice: { icon: <ScienceOutlinedIcon />, color: '#64748B' },
};

function TestRow({ test, onEdit }: { test: NexusOverviewTest; onEdit?: () => void }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.25,
        borderRadius: 1.5,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        transition: 'background-color 150ms',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }} noWrap>
          {test.context_label || test.title}
        </Typography>
        {test.context_label && test.title !== test.context_label && (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
            {test.title}
          </Typography>
        )}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
          <Chip size="small" variant="outlined" label={`${test.question_count} Q`} sx={{ height: 20, fontSize: '0.7rem' }} />
          {test.attempt_count > 0 && (
            <Chip
              size="small"
              variant="outlined"
              label={`${test.attempt_count} ${test.attempt_count === 1 ? 'attempt' : 'attempts'}`}
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          )}
          <Chip
            size="small"
            label={test.is_published ? 'Published' : 'Hidden'}
            color={test.is_published ? 'success' : 'default'}
            variant={test.is_published ? 'filled' : 'outlined'}
            sx={{ height: 20, fontSize: '0.7rem' }}
          />
        </Box>
      </Box>
      {onEdit && (
        <Button
          size="small"
          variant="text"
          startIcon={<EditOutlinedIcon sx={{ fontSize: 16 }} />}
          onClick={onEdit}
          sx={{ textTransform: 'none', flexShrink: 0, minWidth: 44, minHeight: 44 }}
        >
          Edit
        </Button>
      )}
    </Paper>
  );
}

function GroupSection({ group, onEditStudyFile }: { group: NexusTestOverviewGroup; onEditStudyFile: (test: NexusOverviewTest) => void }) {
  const [open, setOpen] = useState(true);
  const meta = GROUP_META[group.key];
  return (
    <Box sx={{ mb: 2 }}>
      <Box
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          py: 0.75,
          cursor: 'pointer',
          borderRadius: 1,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Box
          sx={{
            width: 30,
            height: 30,
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: `${meta.color}1A`,
            color: meta.color,
            '& svg': { fontSize: 18 },
          }}
        >
          {meta.icon}
        </Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
          {group.label}
        </Typography>
        <Chip size="small" label={group.count} sx={{ height: 22, fontWeight: 600 }} />
        <ExpandMoreOutlinedIcon
          sx={{ color: 'text.secondary', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
        />
      </Box>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <Box sx={{ pt: 1 }}>
          {group.subgroups ? (
            group.subgroups.map((sub) => (
              <Box key={sub.key} sx={{ mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75, pl: 0.5 }}>
                  <FolderOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.3 }}>
                    {sub.label}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  {sub.tests.map((t) => (
                    <TestRow key={t.id} test={t} onEdit={t.file_id ? () => onEditStudyFile(t) : undefined} />
                  ))}
                </Box>
              </Box>
            ))
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {group.tests.map((t) => (
                <TestRow key={t.id} test={t} onEdit={t.file_id ? () => onEditStudyFile(t) : undefined} />
              ))}
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

export default function TeacherTestsHubPage() {
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const [groups, setGroups] = useState<NexusTestOverviewGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/question-bank/tests/overview', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to load tests');
      }
      const json = await res.json();
      setGroups(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tests');
      setGroups([]);
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const totalTests = (groups || []).reduce((n, g) => n + g.count, 0);

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2, maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.5 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            Tests
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Every test, grouped by where it is used
            {groups ? ` · ${totalTests} total` : ''}
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddTaskOutlinedIcon />}
          onClick={() => router.push('/teacher/question-bank/build')}
          sx={{ textTransform: 'none', flexShrink: 0 }}
        >
          Build a test
        </Button>
      </Box>

      <Box sx={{ mt: 2 }}>
        {groups === null ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rectangular" height={72} sx={{ borderRadius: 1.5 }} />
            ))}
          </Box>
        ) : error ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography color="error" variant="body2" sx={{ mb: 2 }}>
              {error}
            </Typography>
            <Button variant="outlined" size="small" onClick={load} sx={{ textTransform: 'none' }}>
              Retry
            </Button>
          </Box>
        ) : groups.length === 0 ? (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <FactCheckOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
              No tests yet. Build one from the question bank, or attach a test to a study-material chapter.
            </Typography>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddTaskOutlinedIcon />}
              onClick={() => router.push('/teacher/question-bank/build')}
              sx={{ textTransform: 'none' }}
            >
              Build a test
            </Button>
          </Box>
        ) : (
          groups.map((g) => (
            <GroupSection
              key={g.key}
              group={g}
              onEditStudyFile={(t) =>
                router.push(
                  `/teacher/study-materials?testFile=${t.file_id}&testTitle=${encodeURIComponent(t.context_label || t.title)}`,
                )
              }
            />
          ))
        )}
      </Box>
    </Box>
  );
}
