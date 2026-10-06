'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Collapse,
  EmptyState,
  IconButton,
  Skeleton,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import FunctionsRoundedIcon from '@mui/icons-material/FunctionsRounded';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import SchemaOutlinedIcon from '@mui/icons-material/SchemaOutlined';
import BookmarkBorderOutlinedIcon from '@mui/icons-material/BookmarkBorderOutlined';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import StarBorderRoundedIcon from '@mui/icons-material/StarBorderRounded';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import type { LearningItem, LearningItemKind } from '@/lib/assistant/tutor/types';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
import MathText from '@/components/common/MathText';
import { focusRing } from '@/components/assistant/focusRing';
import { stableHover } from '@/components/assistant/stableHover';
import ConceptChips from '../blocks/ConceptChips';
import { stripBold } from '../blocks/TutorText';
import { KIND_LABEL } from '../labels';
import { useTutorGate } from '../useTutorGate';

export const MY_LEARNING_KEY = '/api/my-learning';
const SELF = '/student/my-learning';

type Filter = 'all' | 'formula' | 'concept' | 'explanation' | 'mistake' | 'important';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'formula', label: 'Formulas' },
  { id: 'concept', label: 'Concepts' },
  { id: 'explanation', label: 'Explanations' },
  { id: 'mistake', label: 'Mistakes' },
  { id: 'important', label: 'Important' },
];

const KIND_ICON: Record<LearningItemKind, typeof FunctionsRoundedIcon> = {
  formula: FunctionsRoundedIcon,
  concept: LightbulbOutlinedIcon,
  explanation: MenuBookOutlinedIcon,
  mistake: FlagOutlinedIcon,
  shortcut: BoltOutlinedIcon,
  example: ListAltOutlinedIcon,
  diagram: SchemaOutlinedIcon,
  bookmark: BookmarkBorderOutlinedIcon,
};

/** "6 Oct 2026" in India time, whatever the device clock's zone. */
const DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** The practice reader on that question, with Back returning here. */
export function questionHref(id: string): string {
  return `/student/question-bank/questions?${new URLSearchParams({ qid: id, back: SELF }).toString()}`;
}

export function matchesFilter(item: LearningItem, f: Filter): boolean {
  if (f === 'all') return true;
  if (f === 'important') return item.important;
  return item.kind === f;
}

async function call<T>(getToken: () => Promise<string | null>, url: string, init: RequestInit): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error('Your session has ended. Sign in again.');
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    });
  } catch {
    throw new Error('You seem to be offline. Check your connection and try again.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'That did not save. Try again.');
  return body as T;
}

/**
 * My Learning: what the student saved from the tutor (formulas, explanations,
 * their own mistakes), filterable, starrable, with a note of their own.
 *
 * One read of the whole list, filtered on the device: the filters are
 * instant and cost nothing. These items carry no answer keys, so the shared
 * SWR cache (which persists to the device) is fine here.
 */
export default function MyLearningList() {
  const gate = useTutorGate();
  const theme = useTheme();
  const { getToken } = useNexusAuthContext();
  const { data, error, isLoading, mutate } = useAuthSWR<{ items: LearningItem[] }>(gate ? MY_LEARNING_KEY : null);
  const [filter, setFilter] = useState<Filter>('all');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<{ id: string; title: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const items = useMemo(() => (data?.items ?? []).filter((i) => !hidden.has(i.id)), [data, hidden]);
  const shown = useMemo(() => items.filter((i) => matchesFilter(i, filter)), [items, filter]);

  const patchLocal = useCallback(
    (id: string, patch: Partial<LearningItem>) =>
      mutate((cur) => (cur ? { items: cur.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) } : cur), { revalidate: false }),
    [mutate],
  );

  const update = useCallback(
    async (item: LearningItem, patch: { note?: string | null; important?: boolean }) => {
      const before = { note: item.note, important: item.important };
      await patchLocal(item.id, patch);
      try {
        const out = await call<{ item: LearningItem }>(getToken, `${MY_LEARNING_KEY}/${encodeURIComponent(item.id)}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
        if (out?.item) await patchLocal(item.id, out.item);
        return true;
      } catch (err) {
        await patchLocal(item.id, before);
        setNotice(err instanceof Error ? err.message : 'That did not save. Try again.');
        return false;
      }
    },
    [getToken, patchLocal],
  );

  // Delete waits for the undo window: the row hides at once, the DELETE goes when the snackbar closes.
  const commitDelete = useCallback(
    async (id: string) => {
      try {
        await call(getToken, `${MY_LEARNING_KEY}/${encodeURIComponent(id)}`, { method: 'DELETE' });
        await mutate((cur) => (cur ? { items: cur.items.filter((i) => i.id !== id) } : cur), { revalidate: false });
      } catch (err) {
        setNotice(err instanceof Error ? `${err.message} The item is back.` : 'Could not delete that. The item is back.');
      } finally {
        setHidden((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [getToken, mutate],
  );

  const pendingRef = useRef<{ id: string; title: string } | null>(null);
  const remove = useCallback(
    (item: LearningItem) => {
      // A second delete inside the window commits the first.
      if (pendingRef.current) void commitDelete(pendingRef.current.id);
      pendingRef.current = { id: item.id, title: item.title };
      setHidden((prev) => new Set(prev).add(item.id));
      setUndo({ id: item.id, title: item.title });
    },
    [commitDelete],
  );

  const closeUndo = useCallback(
    (reason?: string) => {
      if (reason === 'clickaway') return;
      const p = pendingRef.current;
      pendingRef.current = null;
      setUndo(null);
      if (p) void commitDelete(p.id);
    },
    [commitDelete],
  );

  const undoDelete = useCallback(() => {
    const p = pendingRef.current;
    pendingRef.current = null;
    setUndo(null);
    if (!p) return;
    setHidden((prev) => {
      const next = new Set(prev);
      next.delete(p.id);
      return next;
    });
  }, []);

  // Leaving the page inside the undo window still deletes.
  const commitRef = useRef(commitDelete);
  commitRef.current = commitDelete;
  useEffect(
    () => () => {
      if (pendingRef.current) void commitRef.current(pendingRef.current.id);
    },
    [],
  );

  if (!gate) {
    return (
      <EmptyState
        icon={<SchoolOutlinedIcon />}
        title="My Learning is not on for you yet"
        description="It opens with the AI Tutor. Ask your teacher if you would like to try it."
      />
    );
  }

  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, items.filter((i) => matchesFilter(i, f.id)).length])) as Record<Filter, number>;

  return (
    <Box sx={{ maxWidth: 760, mx: 'auto' }}>
      <Box
        role="group"
        aria-label="Show"
        sx={{
          display: 'flex',
          gap: 1,
          mb: 2,
          flexWrap: { xs: 'nowrap', sm: 'wrap' },
          overflowX: { xs: 'auto', sm: 'visible' },
          mx: { xs: -2, sm: 0 },
          px: { xs: 2, sm: 0 },
          pb: 0.5,
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {FILTERS.map((f) => {
          const on = filter === f.id;
          return (
            <Chip
              key={f.id}
              label={data ? `${f.label} ${counts[f.id]}` : f.label}
              onClick={() => setFilter(f.id)}
              aria-pressed={on}
              color={on ? 'primary' : 'default'}
              variant={on ? 'filled' : 'outlined'}
              sx={{
                ...stableHover,
                flexShrink: 0,
                height: 44,
                borderRadius: 22,
                px: 0.5,
                fontWeight: 600,
                fontSize: '0.9375rem',
                cursor: 'pointer',
                '&.Mui-focusVisible': focusRing(theme.palette.primary.dark),
              }}
            />
          );
        })}
      </Box>

      {error && !data ? (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" onClick={() => void mutate()} sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700 }}>
              Try again
            </Button>
          }
        >
          My Learning did not load. Check your connection and try again.
        </Alert>
      ) : isLoading || !data ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<BookmarkBorderOutlinedIcon />}
          title="Nothing saved yet"
          description="Open a maths question, tap Learn with tutor, and save formulas or explanations as you go."
          action={
            <Button component={Link} href="/student/question-bank" variant="contained" sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}>
              Go to the Question Bank
            </Button>
          }
        />
      ) : shown.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          Nothing here under {FILTERS.find((f) => f.id === filter)?.label}. Try All.
        </Typography>
      ) : (
        <Box component="ul" aria-label="Saved items" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
          {shown.map((item) => (
            <Box component="li" key={item.id}>
              <LearningCard item={item} onUpdate={update} onDelete={remove} />
            </Box>
          ))}
        </Box>
      )}

      <Snackbar
        open={!!undo}
        autoHideDuration={5000}
        onClose={(_, reason) => closeUndo(reason)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 88, md: 24 } }}
        message={undo ? `Deleted ${undo.title}` : ''}
        action={
          <Button color="inherit" onClick={undoDelete} sx={{ minHeight: 44, fontWeight: 700, textTransform: 'none', color: 'primary.light' }}>
            Undo
          </Button>
        }
      />
      <Snackbar
        open={!!notice}
        autoHideDuration={5000}
        onClose={() => setNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 88, md: 24 } }}
      >
        <Alert severity="error" variant="filled" onClose={() => setNotice(null)} sx={{ width: '100%' }}>
          {notice}
        </Alert>
      </Snackbar>
    </Box>
  );
}

function LearningCard({
  item,
  onUpdate,
  onDelete,
}: {
  item: LearningItem;
  onUpdate: (item: LearningItem, patch: { note?: string | null; important?: boolean }) => Promise<boolean>;
  onDelete: (item: LearningItem) => void;
}) {
  const theme = useTheme();
  const ring = { '&.Mui-focusVisible': focusRing(theme.palette.primary.dark) };
  const Icon = KIND_ICON[item.kind] ?? BookmarkBorderOutlinedIcon;
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.note ?? '');
  const [saving, setSaving] = useState(false);
  const long = item.body_md.length > 240 || item.body_md.split('\n').length > 4;
  const bodyId = `ml-body-${item.id}`;
  const date = (() => {
    const d = new Date(item.created_at);
    return Number.isNaN(d.getTime()) ? null : DATE.format(d);
  })();

  const saveNote = async () => {
    setSaving(true);
    const ok = await onUpdate(item, { note: draft.trim() ? draft.trim() : null });
    setSaving(false);
    if (ok) setEditing(false);
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 3, p: { xs: 1.5, sm: 2 } }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
        <Box
          aria-hidden
          sx={{ width: 40, height: 40, flexShrink: 0, borderRadius: 2, bgcolor: 'action.hover', color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" component="p">
            {KIND_LABEL[item.kind] ?? 'Saved'}
            {date ? `, saved ${date}` : ''}
          </Typography>
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, lineHeight: 1.35, overflowWrap: 'anywhere' }}>
            {item.title}
          </Typography>
        </Box>
        <Tooltip title={item.important ? 'Marked important' : 'Mark important'}>
          <IconButton
            onClick={() => void onUpdate(item, { important: !item.important })}
            aria-pressed={item.important}
            aria-label={`Important: ${item.title}`}
            sx={{ width: 48, height: 48, flexShrink: 0, mt: -0.5, mr: -0.5, color: item.important ? 'warning.dark' : 'text.secondary', ...ring }}
          >
            {item.important ? <StarRoundedIcon /> : <StarBorderRoundedIcon />}
          </IconButton>
        </Tooltip>
      </Box>

      <Box id={bodyId} sx={{ mt: 1 }}>
        <MathText
          text={stripBold(item.body_md)}
          variant="body1"
          sx={{
            lineHeight: 1.6,
            overflowWrap: 'anywhere',
            ...(long && !expanded ? { display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : {}),
          }}
        />
        {long && (
          <Button
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            aria-controls={bodyId}
            size="small"
            sx={{ ...stableHover, minHeight: 44, px: 1, ml: -1, textTransform: 'none', fontWeight: 700, ...ring }}
          >
            {expanded ? 'Show less' : 'Show more'}
          </Button>
        )}
      </Box>

      {item.concepts.length > 0 && (
        <Box sx={{ mt: 1.25 }}>
          <ConceptChips items={item.concepts} title={null} />
        </Box>
      )}

      {item.note && !editing && (
        <Box sx={{ mt: 1.25, p: 1.25, borderRadius: 2, bgcolor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ fontWeight: 700 }}>
            My note
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {item.note}
          </Typography>
        </Box>
      )}

      <Collapse in={editing} unmountOnExit>
        <Box sx={{ mt: 1.25 }}>
          <TextField
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
            label="My note"
            multiline
            minRows={2}
            fullWidth
            autoFocus
            inputProps={{ maxLength: 1000 }}
            sx={{ '& textarea': { fontSize: 16 } }}
          />
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
            <Button
              onClick={() => {
                setDraft(item.note ?? '');
                setEditing(false);
              }}
              sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}
            >
              Cancel
            </Button>
            <Button variant="contained" onClick={() => void saveNote()} disabled={saving} sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700 }}>
              {saving ? 'Saving...' : 'Save note'}
            </Button>
          </Box>
        </Box>
      </Collapse>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.25, flexWrap: 'wrap' }}>
        {item.source_question_id && (
          <Button
            component={Link}
            href={questionHref(item.source_question_id)}
            endIcon={<OpenInNewRoundedIcon />}
            sx={{ ...stableHover, minHeight: 44, textTransform: 'none', fontWeight: 700, px: 1, ml: -1, ...ring }}
          >
            Open the question
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        {!editing && (
          <Button
            onClick={() => {
              setDraft(item.note ?? '');
              setEditing(true);
            }}
            startIcon={<EditNoteRoundedIcon />}
            sx={{ ...stableHover, minHeight: 44, textTransform: 'none', fontWeight: 600, color: 'text.secondary', ...ring }}
          >
            {item.note ? 'Edit note' : 'Add note'}
          </Button>
        )}
        <IconButton onClick={() => onDelete(item)} aria-label={`Delete ${item.title}`} sx={{ width: 48, height: 48, color: 'text.secondary', ...ring }}>
          <DeleteOutlineRoundedIcon />
        </IconButton>
      </Box>
    </Card>
  );
}

function ListSkeleton() {
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  const animation = reduce ? false : 'pulse';
  return (
    <Box role="status" aria-label="Loading My Learning" sx={{ display: 'grid', gap: 1.5 }}>
      {[0, 1, 2].map((i) => (
        <Card key={i} variant="outlined" sx={{ borderRadius: 3, p: 2 }}>
          <Box sx={{ display: 'flex', gap: 1.25 }}>
            <Skeleton animation={animation} variant="rounded" width={40} height={40} />
            <Box sx={{ flex: 1 }}>
              <Skeleton animation={animation} width="30%" />
              <Skeleton animation={animation} width="60%" height={28} />
            </Box>
          </Box>
          <Skeleton animation={animation} width="95%" sx={{ mt: 1 }} />
          <Skeleton animation={animation} width="85%" />
          <Skeleton animation={animation} width="50%" />
        </Card>
      ))}
    </Box>
  );
}
