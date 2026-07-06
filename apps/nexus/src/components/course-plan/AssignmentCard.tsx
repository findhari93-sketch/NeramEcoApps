'use client';

/**
 * Class Day card that lists the assignments given on this day and opens the
 * editor for new ones. Each row shows status and the submitted/total count and
 * links to the review screen.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, Stack, Chip, Button, alpha } from '@neram/ui';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import AddIcon from '@mui/icons-material/Add';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AssignmentEditorSheet from '@/components/assignments/AssignmentEditorSheet';
import type { ClassDayAssignmentSummary } from './common';

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: '#8D5A00', bg: alpha('#F9A825', 0.18) },
  published: { label: 'Published', color: '#1B5E20', bg: alpha('#2E7D32', 0.12) },
  closed: { label: 'Closed', color: '#5A6672', bg: alpha('#8B95A1', 0.15) },
};

interface AssignmentCardProps {
  assignments: ClassDayAssignmentSummary[];
  planId: string;
  date: string;
  topicId: string | null;
  hasTopicDrills: boolean;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  getToken: () => Promise<string | null>;
  onChanged: () => void;
}

export default function AssignmentCard({
  assignments,
  planId,
  date,
  topicId,
  hasTopicDrills,
  authFetch,
  getToken,
  onChanged,
}: AssignmentCardProps) {
  const router = useRouter();
  const [editorOpen, setEditorOpen] = useState(false);

  return (
    <Box
      sx={{
        mt: 1.5,
        p: 2,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: assignments.length ? 1.25 : 0.5 }}>
        <AssignmentOutlinedIcon sx={{ fontSize: 20, color: 'primary.main' }} />
        <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', flex: 1 }}>Assignments</Typography>
      </Stack>

      <Stack spacing={1}>
        {assignments.map((a) => {
          const meta = STATUS_META[a.status] || STATUS_META.draft;
          return (
            <Box
              key={a.id}
              role="button"
              onClick={() => router.push(`/teacher/assignments/${a.id}`)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 1.25,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                cursor: 'pointer',
                minHeight: 48,
                '&:hover': { borderColor: 'primary.light', bgcolor: 'action.hover' },
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                  {a.title}
                </Typography>
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.25 }}>
                  <Chip
                    label={meta.label}
                    size="small"
                    sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700, bgcolor: meta.bg, color: meta.color }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    out of {a.max_marks}
                    {a.status !== 'draft' ? ` · ${a.submitted_count} submitted` : ''}
                  </Typography>
                </Stack>
              </Box>
              <ChevronRightIcon sx={{ color: 'text.disabled' }} />
            </Box>
          );
        })}
      </Stack>

      <Button
        variant={assignments.length ? 'text' : 'outlined'}
        startIcon={<AddIcon />}
        onClick={() => setEditorOpen(true)}
        sx={{ mt: assignments.length ? 1 : 1.25, minHeight: 44 }}
        fullWidth={!assignments.length}
      >
        New assignment
      </Button>

      <AssignmentEditorSheet
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        planId={planId}
        date={date}
        topicId={topicId}
        hasTopicDrills={hasTopicDrills}
        authFetch={authFetch}
        getToken={getToken}
        onSaved={onChanged}
      />
    </Box>
  );
}
