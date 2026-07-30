'use client';

/**
 * The teacher's reference material for one class.
 *
 * One input does all four kinds. Paste a link and it works out whether it is a
 * video or a web page; drop a file and the MIME type decides between an image
 * and a PDF. That is deliberate: a teacher adding a YouTube explainer between
 * two classes should not first have to tell the app what kind of thing they are
 * about to add.
 *
 * The list itself is ResourceCard, shared with every student surface, so what a
 * teacher arranges here is literally what a student sees.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Skeleton,
  TextField,
  Typography,
  useTheme,
} from '@neram/ui';
import AddLinkIcon from '@mui/icons-material/AddLink';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import type { ClassCardData } from './ClassCard';
import { RADIUS } from './timetable-theme';
import ResourceCard from './ResourceCard';
import ResourceOpener, { openExternalResource } from './ResourceOpener';
import AddResourceFromClassDialog from './AddResourceFromClassDialog';
import ResourceTextDialog from './ResourceTextDialog';
import { makeThumbnail } from '@/lib/image-downscale';
import {
  MAX_RESOURCES_PER_CLASS,
  detectResourceKind,
  sortResources,
  type ClassResource,
} from '@/lib/class-resources';

interface ClassResourcesSectionProps {
  cls: ClassCardData;
  getToken: () => Promise<string | null>;
  /** False renders a read-only list (every student surface). */
  editable: boolean;
  /**
   * Rows the caller already has. Omit and the section fetches its own.
   *
   * The catch-up and recap payloads already load the class, so they pass them in
   * and cost no extra function invocation. Always read-only when provided.
   */
  resources?: ClassResource[];
  /** Bump to force a refetch after a change elsewhere. */
  refreshKey?: number;
  onNotify?: (message: string, severity?: 'success' | 'error') => void;
  /** Rendered above the list, e.g. a section label matching the host panel. */
  header?: React.ReactNode;
  /**
   * Render nothing at all when there is no material. Student surfaces set this:
   * an empty "Reference material" heading on a class that never had any is noise
   * on a screen already carrying a recording, an assignment and a test.
   */
  hideWhenEmpty?: boolean;
  /** Student identity drawn faintly over an opened PDF. */
  watermark?: string;
}

export default function ClassResourcesSection({
  cls,
  getToken,
  editable,
  resources: provided,
  refreshKey,
  onNotify,
  header,
  hideWhenEmpty,
  watermark,
}: ClassResourcesSectionProps) {
  const theme = useTheme();
  const selfFetch = provided === undefined;
  const [fetched, setFetched] = useState<ClassResource[]>([]);
  const [loading, setLoading] = useState(selfFetch);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState('');
  const [opened, setOpened] = useState<ClassResource | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<{ resource: ClassResource; field: 'title' | 'note' } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const classId = cls.id;

  const load = useCallback(async () => {
    if (!selfFetch) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/timetable/${classId}/resources`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFetched(sortResources(data.resources || []));
      }
    } catch {
      /* the empty state covers this */
    } finally {
      setLoading(false);
    }
  }, [selfFetch, classId, getToken]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const resources = provided ? sortResources(provided) : fetched;
  const setResources = setFetched;

  /** Every mutation funnels through here so one place owns errors and busy state. */
  const send = useCallback(
    async (init: RequestInit, onOk: (data: any) => void, fallbackError: string) => {
      setBusy(true);
      try {
        const token = await getToken();
        const res = await fetch(`/api/timetable/${classId}/resources`, {
          ...init,
          headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          onNotify?.(data.error || fallbackError, 'error');
          return false;
        }
        onOk(data);
        return true;
      } catch {
        onNotify?.(fallbackError, 'error');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [classId, getToken, onNotify],
  );

  const atCapacity = resources.length >= MAX_RESOURCES_PER_CLASS;

  const addUrl = async (raw: string) => {
    const url = raw.trim();
    if (!url) return;
    if (!detectResourceKind(url)) {
      onNotify?.('That does not look like a web address. Links must start with http or https.', 'error');
      return;
    }
    setPending(true);
    const ok = await send(
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      },
      (data) => {
        setResources((prev) => sortResources([...prev, data.resource]));
        setDraft('');
        onNotify?.('Added to this class');
      },
      'Could not add that link',
    );
    setPending(false);
    if (!ok) return;
  };

  const addFile = async (file: File) => {
    setPending(true);
    try {
      const form = new FormData();
      form.append('file', file);
      // Images get a browser-made thumbnail so the list does not pull full-size
      // photos. A failure here is fine: the server falls back to the original.
      if (file.type.startsWith('image/')) {
        const thumb = await makeThumbnail(file).catch(() => null);
        if (thumb) form.append('thumb', thumb.blob, `thumb.${thumb.ext === 'jpeg' ? 'jpg' : 'webp'}`);
      }
      await send(
        { method: 'POST', body: form },
        (data) => {
          setResources((prev) => sortResources([...prev, data.resource]));
          onNotify?.('Added to this class');
        },
        'Could not upload that file',
      );
    } finally {
      setPending(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const move = async (resource: ClassResource, direction: -1 | 1) => {
    const index = resources.findIndex((r) => r.id === resource.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= resources.length) return;

    const next = [...resources];
    [next[index], next[target]] = [next[target], next[index]];
    setResources(next); // optimistic: reordering should feel instant

    await send(
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: next.map((r) => r.id) }),
      },
      (data) => setResources(sortResources(data.resources || next)),
      'Could not reorder that',
    );
  };

  const saveText = async (value: string) => {
    if (!editing) return;
    const field = editing.field;
    const id = editing.resource.id;
    setEditing(null);
    await send(
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, [field]: value }),
      },
      (data) =>
        setResources((prev) => prev.map((r) => (r.id === id ? data.resource : r))),
      'Could not save that',
    );
  };

  // DELETE takes its id in the query string, so it cannot go through `send`'s
  // shared URL. Kept separate rather than complicating the helper.
  const removeById = async (resource: ClassResource) => {
    setBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/timetable/${classId}/resources?id=${resource.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setResources((prev) => prev.filter((r) => r.id !== resource.id));
        onNotify?.('Removed from this class');
      } else {
        const data = await res.json().catch(() => ({}));
        onNotify?.(data.error || 'Could not remove that', 'error');
      }
    } catch {
      onNotify?.('Could not remove that', 'error');
    } finally {
      setBusy(false);
    }
  };

  const openResource = (resource: ClassResource) => {
    if (openExternalResource(resource)) return;
    setOpened(resource);
  };

  // A student surface with nothing to show renders nothing at all, rather than a
  // heading over an empty box.
  if (hideWhenEmpty && !loading && resources.length === 0) return null;

  return (
    <Box>
      {header}

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Skeleton variant="rounded" height={56} />
          <Skeleton variant="rounded" height={56} />
        </Box>
      ) : resources.length > 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {resources.map((resource, i) => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              onOpen={openResource}
              editable={editable}
              busy={busy}
              isFirst={i === 0}
              isLast={i === resources.length - 1}
              onRename={(r) => setEditing({ resource: r, field: 'title' })}
              onEditNote={(r) => setEditing({ resource: r, field: 'note' })}
              onMove={move}
              onRemove={removeById}
            />
          ))}
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
            No reference material yet. Students can open whatever you add here, any time.
          </Typography>
        </Box>
      ) : null}

      {pending && (
        <Box sx={{ mt: 1 }}>
          <Skeleton variant="rounded" height={56} />
        </Box>
      )}

      {editable && (
        <Box sx={{ mt: resources.length || loading ? 1.25 : 1.5 }}>
          <TextField
            fullWidth
            size="small"
            value={draft}
            disabled={busy || pending || atCapacity}
            placeholder="Paste a link, or drop a file"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addUrl(draft);
              }
            }}
            // A pasted link is almost never something the teacher wants to then
            // edit, so it commits on paste instead of waiting for Enter.
            onPaste={(e) => {
              const text = e.clipboardData.getData('text');
              if (detectResourceKind(text)) {
                e.preventDefault();
                addUrl(text);
              }
            }}
            onDrop={(e) => {
              const file = e.dataTransfer?.files?.[0];
              if (file) {
                e.preventDefault();
                addFile(file);
              }
            }}
            inputProps={{ 'aria-label': 'Paste a link to add reference material' }}
            sx={{ '& .MuiInputBase-root': { minHeight: 48, borderRadius: RADIUS.control } }}
          />

          <Box sx={{ display: 'flex', gap: 0.875, mt: 1, flexWrap: 'wrap' }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<UploadFileOutlinedIcon />}
              disabled={busy || pending || atCapacity}
              onClick={() => fileRef.current?.click()}
              sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
            >
              Image or PDF
            </Button>
            <Button
              size="small"
              startIcon={<AddLinkIcon />}
              disabled={busy || pending || atCapacity}
              onClick={() => setPickerOpen(true)}
              sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
            >
              Add from another class
            </Button>
          </Box>

          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.75 }}>
            {atCapacity
              ? `That is the limit of ${MAX_RESOURCES_PER_CLASS}. Remove one to add another.`
              : 'Students see this on the class, and while catching up.'}
          </Typography>

          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) addFile(file);
            }}
          />
        </Box>
      )}

      <ResourceOpener
        resource={opened}
        onClose={() => setOpened(null)}
        getToken={getToken}
        watermark={watermark}
      />

      {editable && (
        <>
          <AddResourceFromClassDialog
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            classId={classId}
            getToken={getToken}
            onAdded={(resource) => {
              setResources((prev) => sortResources([...prev, resource]));
              onNotify?.('Added to this class');
            }}
            onNotify={onNotify}
          />
          <ResourceTextDialog
            open={Boolean(editing)}
            field={editing?.field ?? 'title'}
            initialValue={
              editing ? (editing.field === 'title' ? editing.resource.title : editing.resource.note || '') : ''
            }
            onCancel={() => setEditing(null)}
            onSave={saveText}
          />
        </>
      )}
    </Box>
  );
}
