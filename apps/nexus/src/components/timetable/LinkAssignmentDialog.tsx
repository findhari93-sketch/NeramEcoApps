'use client';

/**
 * Attach an assignment that already exists to a timetable class.
 *
 * Assignments are not always born from a class: most are created standalone in
 * the Assignments space and only later belong to a session. This dialog is the
 * "later" half, and it is deliberately the ONLY link path, shared by the card
 * menu in the planner and the class editing panel, so the two cannot drift.
 *
 * The empty state matters more than the list. A disabled "Link existing" button
 * with no explanation is what sent people looking for a bug, so when nothing is
 * linkable this says why and offers the way forward instead.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import type { ClassCardData } from './ClassCard';
import { formatTime } from './date-utils';
import { RADIUS, tagSx } from './timetable-theme';

export interface LinkableAssignment {
  id: string;
  title: string;
  status: string;
  assignment_type: string;
  due_at: string | null;
  class_date: string | null;
}

interface LinkAssignmentDialogProps {
  open: boolean;
  cls: ClassCardData | null;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  /** Linked successfully. The caller refreshes counts. */
  onLinked: () => void;
  /** "Create one instead", handed back so the caller owns the create dialog. */
  onCreateInstead: (cls: ClassCardData) => void;
  onNotify: (message: string, severity?: 'success' | 'error') => void;
}

function shortDate(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function LinkAssignmentDialog({
  open,
  cls,
  getToken,
  onClose,
  onLinked,
  onCreateInstead,
  onNotify,
}: LinkAssignmentDialogProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));
  const [items, setItems] = useState<LinkableAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const classId = cls?.id ?? null;

  const load = useCallback(async () => {
    if (!open || !classId) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/timetable/${classId}/assignments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.linkable || []);
      }
    } catch {
      /* the empty state covers this */
    } finally {
      setLoading(false);
    }
  }, [open, classId, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const link = async (assignmentId: string) => {
    if (!classId) return;
    setBusyId(assignmentId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/timetable/${classId}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ assignment_id: assignmentId }),
      });
      if (res.ok) {
        onNotify('Assignment linked to this class');
        onLinked();
        onClose();
      } else {
        const d = await res.json().catch(() => ({}));
        onNotify(d.error || 'Could not link that assignment', 'error');
      }
    } catch {
      onNotify('Could not link that assignment', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const body = (
    <>
      {cls && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            py: 1.25,
            mb: 2,
            borderRadius: RADIUS.control,
            bgcolor: alpha(theme.palette.primary.main, 0.07),
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.dark' }}>
            {cls.title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatTime(cls.start_time)} to {formatTime(cls.end_time)}
          </Typography>
        </Box>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : items.length === 0 ? (
        <Box
          sx={{
            border: `1px dashed ${theme.palette.divider}`,
            borderRadius: RADIUS.card,
            p: 3,
            textAlign: 'center',
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
            Nothing to link yet
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Every assignment in this classroom is already attached to a class. Assignments made
            for another classroom cannot be linked here.
          </Typography>
          {cls && (
            <Button
              variant="contained"
              onClick={() => {
                onClose();
                onCreateInstead(cls);
              }}
              sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
            >
              Create one instead
            </Button>
          )}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {items.map((a) => {
            const drawing = a.assignment_type === 'drawing';
            return (
              <Box
                key={a.id}
                component="button"
                type="button"
                disabled={!!busyId}
                onClick={() => link(a.id)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  width: '100%',
                  textAlign: 'left',
                  minHeight: 56,
                  px: 1.75,
                  py: 1.25,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  appearance: 'none',
                  borderRadius: RADIUS.control,
                  border: `1px solid ${theme.palette.divider}`,
                  bgcolor: 'background.paper',
                  opacity: busyId && busyId !== a.id ? 0.5 : 1,
                  '&:hover:not(:disabled)': {
                    borderColor: theme.palette.primary.main,
                    bgcolor: alpha(theme.palette.primary.main, 0.04),
                  },
                  '&:focus-visible': {
                    outline: `2px solid ${theme.palette.primary.main}`,
                    outlineOffset: 2,
                  },
                }}
              >
                <Box
                  sx={{
                    width: 30,
                    height: 30,
                    flexShrink: 0,
                    borderRadius: 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                    color: 'primary.dark',
                  }}
                >
                  {drawing ? (
                    <BrushOutlinedIcon sx={{ fontSize: 17 }} />
                  ) : (
                    <DescriptionOutlinedIcon sx={{ fontSize: 17 }} />
                  )}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.8438rem', lineHeight: 1.3 }} noWrap>
                    {a.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {drawing ? 'Drawing' : 'Document'}
                    {a.class_date ? `, ${shortDate(a.class_date)}` : ''}
                  </Typography>
                </Box>
                {a.status !== 'published' && (
                  <Box component="span" sx={tagSx(theme, 'neutral')}>
                    Draft
                  </Box>
                )}
                {busyId === a.id && <CircularProgress size={16} />}
              </Box>
            );
          })}
        </Box>
      )}
    </>
  );

  const title = (
    <Box>
      <Typography
        sx={{
          fontSize: '0.6563rem',
          fontWeight: 700,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          color: 'primary.main',
        }}
      >
        Link existing
      </Typography>
      <Typography sx={{ fontWeight: 800, fontSize: '1.125rem', lineHeight: 1.3 }}>
        Pick an assignment
      </Typography>
    </Box>
  );

  // Bottom sheet on phones, dialog on desktop, matching the rest of Nexus.
  if (!isDesktop) {
    return (
      <Drawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        PaperProps={{ sx: { borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '85vh' } }}
      >
        <Box sx={{ p: 2.5 }}>
          <Box sx={{ mb: 2 }}>{title}</Box>
          {body}
          <Button
            fullWidth
            onClick={onClose}
            sx={{ mt: 2, textTransform: 'none', minHeight: 48 }}
          >
            Cancel
          </Button>
        </Box>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>{body}</DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ textTransform: 'none', minHeight: 44 }}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
}
