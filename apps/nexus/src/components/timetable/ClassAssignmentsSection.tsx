'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import type { ClassCardData } from './ClassCard';
import { RADIUS } from './timetable-theme';
import { preworkDueLabel } from '@/lib/prework';
import { useNexusSWR, useRefreshKey } from '@/lib/nexus-swr';

export interface SectionAssignment {
  id: string;
  title: string;
  status: string;
  due_at: string | null;
  assignment_type?: string | null;
  timing?: string | null;
}

interface ClassAssignmentsSectionProps {
  cls: ClassCardData;
  getToken: () => Promise<string | null>;
  /** Show Link / Create / Unlink. False renders a read-only list. */
  editable: boolean;
  /** Rows the caller already has. Omit and the section fetches its own. */
  assignments?: SectionAssignment[];
  /** Bump to force a refetch after a link or unlink elsewhere. */
  refreshKey?: number;
  onLinkExisting?: (cls: ClassCardData) => void;
  onCreateAssignment?: (cls: ClassCardData) => void;
  onNotify?: (message: string, severity?: 'success' | 'error') => void;
  /** Rendered above the list, e.g. a section label matching the host panel. */
  header?: React.ReactNode;
}

/**
 * The work attached to one class, grouped by when it is due.
 *
 * Extracted from ClassEditPanel so the plan rail and the class detail panel
 * render the same thing. Before this, attaching work to a class existed ONLY in
 * Plan view: a teacher in Day, Week or Month could see a class, tap it, and find
 * no way to give it an assignment at all.
 */
export default function ClassAssignmentsSection({
  cls,
  getToken,
  editable,
  assignments: provided,
  refreshKey,
  onLinkExisting,
  onCreateAssignment,
  onNotify,
  header,
}: ClassAssignmentsSectionProps) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);

  // A caller that already holds the rows passes them in, and this section must
  // not fetch at all. A null SWR key is how that is expressed.
  const selfFetch = provided === undefined;

  const { data, isLoading, mutate } = useNexusSWR<{ assignments?: SectionAssignment[] }>(
    selfFetch && cls?.id ? `/api/timetable/${cls.id}/assignments` : null,
    getToken,
  );
  useRefreshKey(refreshKey, mutate);

  const loading = isLoading;
  const assignments = provided ?? data?.assignments ?? [];

  const unlink = async (assignmentId: string) => {
    setBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/timetable/${cls.id}/assignments`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ assignment_id: assignmentId }),
      });
      if (res.ok) {
        // Drop the row from the cache immediately and skip the refetch: the
        // DELETE already told us the outcome, so a round trip would only make
        // the row linger for another 200ms.
        await mutate(
          (current) => ({
            ...current,
            assignments: (current?.assignments ?? []).filter((a) => a.id !== assignmentId),
          }),
          { revalidate: false },
        );
        onNotify?.('Unlinked from this class');
      } else {
        const d = await res.json().catch(() => ({}));
        onNotify?.(d.error || 'Could not unlink that assignment', 'error');
      }
    } catch {
      onNotify?.('Could not unlink that assignment', 'error');
    } finally {
      setBusy(false);
    }
  };

  const prework = assignments.filter((a) => a.timing === 'prework');
  const homework = assignments.filter((a) => a.timing !== 'prework');

  const row = (a: SectionAssignment) => {
    const drawing = a.assignment_type === 'drawing';
    const Icon = drawing ? BrushOutlinedIcon : DescriptionOutlinedIcon;
    const isPrework = a.timing === 'prework';
    return (
      <Box
        key={a.id}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.125,
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: RADIUS.control,
          p: 1.375,
        }}
      >
        <Box
          sx={{
            width: 26,
            height: 26,
            borderRadius: 1,
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: alpha(theme.palette.primary.main, 0.1),
            color: 'primary.dark',
          }}
        >
          <Icon sx={{ fontSize: 15 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.7813rem', lineHeight: 1.3 }} noWrap>
            {a.title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {a.status === 'published' ? 'Published' : 'Draft'}
            {isPrework
              ? `, ${preworkDueLabel(a.due_at).toLowerCase()}`
              : a.due_at
                ? `, due ${new Date(a.due_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                : ''}
          </Typography>
        </Box>
        {editable && (
          <Button
            size="small"
            onClick={() => unlink(a.id)}
            disabled={busy}
            aria-label={`Unlink ${a.title}`}
            sx={{ minWidth: 40, minHeight: 40, color: 'text.disabled' }}
          >
            <LinkOffIcon fontSize="small" />
          </Button>
        )}
      </Box>
    );
  };

  const groupLabel = (text: string) => (
    <Typography
      variant="caption"
      sx={{
        display: 'block',
        fontWeight: 700,
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        color: 'text.secondary',
        mt: 0.5,
        mb: 0.75,
      }}
    >
      {text}
    </Typography>
  );

  return (
    <Box>
      {header}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={20} />
        </Box>
      ) : assignments.length > 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {/* Grouped, and only when both kinds exist: one heading over one list
              is noise. */}
          {prework.length > 0 && homework.length > 0 && groupLabel('Before this class')}
          {prework.map(row)}
          {prework.length > 0 && homework.length > 0 && groupLabel('From this class')}
          {homework.map(row)}
        </Box>
      ) : editable ? (
        <Box
          sx={{
            border: `1px dashed ${theme.palette.divider}`,
            borderRadius: RADIUS.control,
            p: 1.5,
            textAlign: 'center',
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.125 }}>
            No assignment linked yet
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.875, justifyContent: 'center', flexWrap: 'wrap' }}>
            {/* Never disabled. Whether anything is linkable is the dialog's
                story to tell, and it tells it in words. */}
            <Button
              size="small"
              variant="outlined"
              onClick={() => onLinkExisting?.(cls)}
              sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
            >
              Link existing
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={() => onCreateAssignment?.(cls)}
              sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
            >
              Create new
            </Button>
          </Box>
        </Box>
      ) : null}

      {editable && !loading && assignments.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.875, mt: 1.25, flexWrap: 'wrap' }}>
          <Button
            size="small"
            onClick={() => onLinkExisting?.(cls)}
            sx={{ textTransform: 'none', minHeight: 40, borderRadius: RADIUS.control }}
          >
            Link another
          </Button>
          <Button
            size="small"
            onClick={() => onCreateAssignment?.(cls)}
            sx={{ textTransform: 'none', minHeight: 40, borderRadius: RADIUS.control }}
          >
            Create new
          </Button>
        </Box>
      )}
    </Box>
  );
}
