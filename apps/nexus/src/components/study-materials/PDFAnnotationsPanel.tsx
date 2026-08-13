'use client';

/**
 * "My Notes" — a Kindle-style list of every highlight, pen mark, and sticky note a
 * student has made on one file, grouped by page and tap-to-jump. Read-only when a
 * teacher is viewing a specific student's marks (ChapterWorkspaceRail's Students tab).
 */

import { useMemo } from 'react';
import { Box, Typography, IconButton, Skeleton, Divider } from '@neram/ui';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import BorderColorIcon from '@mui/icons-material/BorderColor';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import { timeAgo } from '@/components/catchup/shared';
import type { NexusStudyAnnotationDTO } from '@neram/database/types';

interface PDFAnnotationsPanelProps {
  annotations: NexusStudyAnnotationDTO[];
  loading: boolean;
  readOnly?: boolean;
  onJumpToPage: (page: number) => void;
  onDelete?: (id: string) => void;
}

function kindIcon(kind: NexusStudyAnnotationDTO['kind']) {
  if (kind === 'note') return <StickyNote2OutlinedIcon fontSize="small" />;
  if (kind === 'pen') return <EditOutlinedIcon fontSize="small" />;
  return <BorderColorIcon fontSize="small" />;
}

function kindLabel(kind: NexusStudyAnnotationDTO['kind']) {
  if (kind === 'note') return 'Note';
  if (kind === 'pen') return 'Pen mark';
  return 'Highlight';
}

export default function PDFAnnotationsPanel({
  annotations,
  loading,
  readOnly,
  onJumpToPage,
  onDelete,
}: PDFAnnotationsPanelProps) {
  const byPage = useMemo(() => {
    const groups = new Map<number, NexusStudyAnnotationDTO[]>();
    for (const a of annotations) {
      const list = groups.get(a.page_number);
      if (list) list.push(a);
      else groups.set(a.page_number, [a]);
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [annotations]);

  if (loading) {
    return (
      <Box sx={{ p: 2 }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rounded" height={56} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }

  if (annotations.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {readOnly
            ? 'This student has not marked up this chapter yet.'
            : 'No highlights or notes yet. Tap the pencil icon while reading to mark up a page.'}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      {byPage.map(([page, items]) => (
        <Box key={page}>
          <Box
            onClick={() => onJumpToPage(page)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              px: 2,
              py: 1,
              cursor: 'pointer',
              bgcolor: 'action.hover',
              '&:hover': { bgcolor: 'action.selected' },
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700, flex: 1 }}>
              Page {page}
            </Typography>
            <ChevronRightIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          </Box>
          {items.map((a) => (
            <Box
              key={a.id}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1,
                px: 2,
                py: 1.25,
                minHeight: 48,
              }}
            >
              <Box
                sx={{
                  width: 22,
                  height: 22,
                  flexShrink: 0,
                  borderRadius: '50%',
                  bgcolor: a.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mt: 0.25,
                }}
              >
                {kindIcon(a.kind)}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  {kindLabel(a.kind)} · {timeAgo(a.created_at)}
                </Typography>
                {a.note_text && (
                  <Typography variant="body2" sx={{ mt: 0.25, wordBreak: 'break-word' }}>
                    {a.note_text}
                  </Typography>
                )}
              </Box>
              {!readOnly && onDelete && (
                <IconButton
                  size="small"
                  onClick={() => onDelete(a.id)}
                  aria-label="Delete"
                  sx={{ width: 40, height: 40, flexShrink: 0 }}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          ))}
          <Divider />
        </Box>
      ))}
    </Box>
  );
}
