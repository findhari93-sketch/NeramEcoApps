'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import type { NexusQBTag, NexusQBTagGroup, NexusQBTagNode, QBQuestionFormat } from '@neram/database';
import { buildQBTagTree, groupQBCategories, QB_CATEGORY_LABELS } from '@neram/database';

const GROUP_LABEL: Record<NexusQBTagGroup, string> = { exam: 'Exam', subject: 'Subject', theme: 'Theme' };

export interface TagCategoryDialogProps {
  open: boolean;
  onClose: () => void;
  questionFormat: QBQuestionFormat;
  categories: string[];
  tagIds: string[];
  onApply: (next: { categories: string[]; tagIds: string[] }) => void;
  getToken: () => Promise<string | null>;
}

/** A tag row and its indent depth, flattened for a plain scrolling list. */
function flattenTree(nodes: NexusQBTagNode[], depth = 0): Array<{ node: NexusQBTagNode; depth: number }> {
  const out: Array<{ node: NexusQBTagNode; depth: number }> = [];
  for (const node of nodes) {
    out.push({ node, depth });
    if (node.children.length) out.push(...flattenTree(node.children, depth + 1));
  }
  return out;
}

/**
 * Keep a node if its own label matches, or a descendant's does.
 *
 * A plain filter on the flattened list would show "Street view" with no
 * "Drawing" above it to say what it is a street view OF. Matching by subtree
 * instead is also what makes searching "drawing" surface every sub-type leaf,
 * none of which have the word "drawing" in their own label.
 */
function filterTree(nodes: NexusQBTagNode[], query: string): NexusQBTagNode[] {
  if (!query) return nodes;
  const out: NexusQBTagNode[] = [];
  for (const node of nodes) {
    const ownMatch = node.label.toLowerCase().includes(query);
    const children = filterTree(node.children, query);
    if (ownMatch || children.length > 0) {
      out.push({ ...node, children: ownMatch ? node.children : children });
    }
  }
  return out;
}

/**
 * Search, select, and create, for both the tag registry and the category
 * chips, in one dialog.
 *
 * Two systems, one dialog, because a teacher classifying a question does not
 * think "which of two parallel taxonomies am I in", they think "what is this
 * question about". Tags first: that is the part this screen had no way to
 * reach before, since the 58-chip wall only ever wrote `categories[]`.
 */
export default function TagCategoryDialog({
  open,
  onClose,
  questionFormat,
  categories,
  tagIds,
  onApply,
  getToken,
}: TagCategoryDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');
  const [allTags, setAllTags] = useState<NexusQBTag[]>([]);
  const [loadingTags, setLoadingTags] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createGroup, setCreateGroup] = useState<NexusQBTagGroup>('theme');

  const [localTagIds, setLocalTagIds] = useState<string[]>(tagIds);
  const [localCategories, setLocalCategories] = useState<string[]>(categories);

  useEffect(() => {
    if (!open) return;
    setLocalTagIds(tagIds);
    setLocalCategories(categories);
    setCreateError(null);
    // Tags is always first, but for a drawing question it is the ONLY tab
    // with anything to offer: sub-types (2D/3D/kit and their leaves) live
    // only as tags, never as categories. Prefilling the search gets a
    // teacher straight to the drawing branch instead of scanning ~70 rows.
    setTab(0);
    setSearch(questionFormat === 'DRAWING_PROMPT' ? 'drawing' : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, questionFormat]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingTags(true);
      setLoadError(null);
      try {
        const token = await getToken();
        if (!token) throw new Error('Not signed in');
        const res = await fetch('/api/question-bank/tags', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Could not load tags');
        const json = await res.json();
        if (!cancelled) setAllTags(json.data || []);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load tags');
      } finally {
        if (!cancelled) setLoadingTags(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, getToken]);

  const tagTree = useMemo(() => buildQBTagTree(allTags), [allTags]);
  const searchLower = search.trim().toLowerCase();
  const visibleTags = useMemo(
    () => flattenTree(filterTree(tagTree, searchLower)),
    [tagTree, searchLower],
  );

  const categoryGroups = useMemo(() => groupQBCategories(), []);
  const visibleCategoryGroups = searchLower
    ? categoryGroups
        .map((g) => ({
          ...g,
          categories: g.categories.filter((c) =>
            (QB_CATEGORY_LABELS[c] || c).toLowerCase().includes(searchLower),
          ),
        }))
        .filter((g) => g.categories.length > 0)
    : categoryGroups;

  const exactTagMatch = allTags.some((t) => t.label.toLowerCase() === searchLower);
  const canOfferCreate = tab === 0 && searchLower.length > 1 && !exactTagMatch;

  const toggleTag = (id: string) => {
    setLocalTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const toggleCategory = (slug: string) => {
    setLocalCategories((prev) => (prev.includes(slug) ? prev.filter((x) => x !== slug) : [...prev, slug]));
  };

  const createTag = async () => {
    const label = search.trim();
    if (!label) return;
    setCreating(true);
    setCreateError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/question-bank/tags', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_type: createGroup, label, find_or_create: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Surfaced, not swallowed. TagPicker's `if (!res.ok) return null`
        // is how a 409 or a 403 drops a tag with no sign anything went wrong.
        throw new Error(json.error || `Could not create the tag (${res.status})`);
      }
      const created: NexusQBTag = json.data;
      setAllTags((prev) => (prev.some((t) => t.id === created.id) ? prev : [...prev, created]));
      setLocalTagIds((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
      setSearch('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create the tag');
    } finally {
      setCreating(false);
    }
  };

  const selectedCount = localTagIds.length + localCategories.length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { height: fullScreen ? '100%' : 640 } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 6 }}>
        Tags and categories
        <IconButton
          aria-label="Close"
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8, minWidth: 44, minHeight: 44 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Tags" />
        <Tab label="Categories" />
      </Tabs>

      <Box sx={{ px: 2, pt: 1.5 }}>
        <TextField
          autoFocus
          fullWidth
          size="small"
          placeholder={tab === 0 ? 'Search or create a tag' : 'Search categories'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Box>

      <DialogContent sx={{ pt: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {tab === 0 ? (
          <>
            {loadingTags ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={24} />
              </Box>
            ) : loadError ? (
              <Alert severity="error">{loadError}</Alert>
            ) : (
              <List dense sx={{ overflowY: 'auto', flex: 1 }}>
                {canOfferCreate && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 1, mb: 1, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
                    <Select
                      size="small"
                      value={createGroup}
                      onChange={(e) => setCreateGroup(e.target.value as NexusQBTagGroup)}
                      sx={{ minWidth: 110 }}
                    >
                      <MenuItem value="exam">Exam</MenuItem>
                      <MenuItem value="subject">Subject</MenuItem>
                      <MenuItem value="theme">Theme</MenuItem>
                    </Select>
                    <Button
                      size="small"
                      startIcon={creating ? <CircularProgress size={14} /> : <AddIcon />}
                      onClick={createTag}
                      disabled={creating}
                      sx={{ textTransform: 'none', minHeight: 36 }}
                    >
                      Create &quot;{search.trim()}&quot;
                    </Button>
                  </Box>
                )}
                {createError && (
                  <Alert severity="error" sx={{ mb: 1 }} onClose={() => setCreateError(null)}>
                    {createError}
                  </Alert>
                )}
                {(() => {
                  let lastGroup: NexusQBTagGroup | null = null;
                  return visibleTags.map(({ node, depth }) => {
                    const header = node.group_type !== lastGroup && depth === 0;
                    if (header) lastGroup = node.group_type;
                    return (
                      <Box key={node.id}>
                        {header && (
                          <Typography
                            variant="caption"
                            color="text.disabled"
                            sx={{ display: 'block', fontWeight: 600, px: 1, pt: 1, position: 'sticky', top: 0, bgcolor: 'background.paper' }}
                          >
                            {GROUP_LABEL[node.group_type]}
                          </Typography>
                        )}
                        <ListItemButton
                          onClick={() => toggleTag(node.id)}
                          dense
                          sx={{ pl: 2 + depth * 2, minHeight: 40 }}
                        >
                          <ListItemIcon sx={{ minWidth: 32 }}>
                            <Checkbox
                              size="small"
                              edge="start"
                              checked={localTagIds.includes(node.id)}
                              tabIndex={-1}
                              disableRipple
                            />
                          </ListItemIcon>
                          <ListItemText primary={node.label} />
                          {node.rollup_count > 0 && (
                            <Typography variant="caption" color="text.disabled">
                              {node.rollup_count}
                            </Typography>
                          )}
                        </ListItemButton>
                      </Box>
                    );
                  });
                })()}
                {!loadingTags && visibleTags.length === 0 && !canOfferCreate && (
                  <Typography variant="body2" color="text.disabled" sx={{ px: 1, py: 2 }}>
                    No tags match &quot;{search}&quot;.
                  </Typography>
                )}
              </List>
            )}
          </>
        ) : (
          <Box sx={{ overflowY: 'auto', flex: 1 }}>
            {visibleCategoryGroups.map((group) => (
              <Box key={group.label} sx={{ mb: 1.5 }}>
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', fontWeight: 600, mb: 0.5 }}>
                  {group.label}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {group.categories.map((cat) => (
                    <Chip
                      key={cat}
                      label={QB_CATEGORY_LABELS[cat] || cat}
                      size="small"
                      variant={localCategories.includes(cat) ? 'filled' : 'outlined'}
                      color={localCategories.includes(cat) ? 'primary' : 'default'}
                      onClick={() => toggleCategory(cat)}
                      sx={{ cursor: 'pointer' }}
                    />
                  ))}
                </Box>
              </Box>
            ))}
            {visibleCategoryGroups.length === 0 && (
              <Typography variant="body2" color="text.disabled" sx={{ px: 1, py: 2 }}>
                No categories match &quot;{search}&quot;.
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2, pb: 2, display: 'flex', alignItems: 'center' }}>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto' }}>
          {selectedCount} selected
        </Typography>
        <Button onClick={onClose} sx={{ minHeight: 44 }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => onApply({ categories: localCategories, tagIds: localTagIds })}
          sx={{ minHeight: 44 }}
        >
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
