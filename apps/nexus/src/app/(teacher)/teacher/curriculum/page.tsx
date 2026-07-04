'use client';

/**
 * Curriculum repository: org-wide modules containing topics, shared by all teaching plans.
 * Fast capture first (quick-add), full authoring on the topic detail page.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Card,
  Chip,
  Button,
  IconButton,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Stack,
  Snackbar,
  Alert,
  Collapse,
  EmptyState,
  alpha,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import {
  RepoModule,
  PRIORITY_OPTIONS,
  DELIVERY_OPTIONS,
  PriorityBadge,
  TopicStatusChip,
  DeliveryIcon,
  moduleColor,
  useAuthFetch,
} from '@/components/curriculum/shared';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

const EXAM_TAGS = [
  { value: 'nata', label: 'NATA' },
  { value: 'jee', label: 'JEE' },
  { value: 'foundation', label: 'Foundation' },
];

type Filter = 'all' | 'mandatory' | 'high' | 'class_ready' | 'drafted' | 'idea';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'mandatory', label: 'Mandatory' },
  { value: 'high', label: 'High' },
  { value: 'class_ready', label: 'Class ready' },
  { value: 'drafted', label: 'Drafted' },
  { value: 'idea', label: 'Ideas' },
];

export default function CurriculumPage() {
  const router = useRouter();
  const { loading: authLoading } = useNexusAuthContext();
  const authFetch = useAuthFetch();

  const [modules, setModules] = useState<RepoModule[] | null>(null);
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);
  const [busy, setBusy] = useState(false);

  // Quick-add dialogs
  const [topicDialog, setTopicDialog] = useState<{ moduleId?: string } | null>(null);
  const [tTitle, setTTitle] = useState('');
  const [tModule, setTModule] = useState('');
  const [tPriority, setTPriority] = useState('high');
  const [tDelivery, setTDelivery] = useState('live');
  const [tSessions, setTSessions] = useState(1);
  const [moduleDialog, setModuleDialog] = useState(false);
  const [mTitle, setMTitle] = useState('');
  const [mExams, setMExams] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await authFetch('/api/curriculum');
      setModules(data.modules);
      setOpenModules((prev) => {
        const next = { ...prev };
        for (const m of data.modules as RepoModule[]) if (!(m.id in next)) next[m.id] = true;
        return next;
      });
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to load', sev: 'error' });
      setModules([]);
    }
  }, [authFetch]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  const allTopics = useMemo(() => (modules || []).flatMap((m) => m.topics), [modules]);
  const stats = useMemo(
    () => ({
      total: allTopics.length,
      ready: allTopics.filter((t) => t.status === 'class_ready').length,
      drafted: allTopics.filter((t) => t.status === 'drafted').length,
      idea: allTopics.filter((t) => t.status === 'idea').length,
    }),
    [allTopics],
  );

  const matchesFilter = (t: RepoModule['topics'][number]) =>
    filter === 'all' || t.priority === filter || t.status === filter;

  const openTopicDialog = (moduleId?: string) => {
    setTTitle('');
    setTModule(moduleId || modules?.[0]?.id || '');
    setTPriority('high');
    setTDelivery('live');
    setTSessions(1);
    setTopicDialog({ moduleId });
  };

  const createTopic = async () => {
    if (!tTitle.trim() || !tModule) return;
    setBusy(true);
    try {
      await authFetch('/api/curriculum', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create_topic',
          module_id: tModule,
          title: tTitle,
          priority: tPriority,
          intended_delivery: tDelivery,
          estimated_sessions: tSessions,
        }),
      });
      setTopicDialog(null);
      setSnack({ msg: 'Added as an Idea. Open it to write the class content.', sev: 'success' });
      load();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to add topic', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const createModule = async () => {
    if (!mTitle.trim()) return;
    setBusy(true);
    try {
      await authFetch('/api/curriculum', {
        method: 'POST',
        body: JSON.stringify({ action: 'create_module', title: mTitle, exam_tags: mExams }),
      });
      setModuleDialog(false);
      setMTitle('');
      setMExams([]);
      setSnack({ msg: 'Module created.', sev: 'success' });
      load();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to add module', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const statCards = [
    { label: 'Topics', value: stats.total, icon: <AutoStoriesOutlinedIcon />, color: '#7C3AED' },
    { label: 'Class ready', value: stats.ready, icon: <CheckCircleOutlineIcon />, color: '#2E7D32' },
    { label: 'Drafted', value: stats.drafted, icon: <EditNoteOutlinedIcon />, color: '#EF6C00' },
    { label: 'Ideas', value: stats.idea, icon: <LightbulbOutlinedIcon />, color: '#5A6672' },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1.5, mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' }, letterSpacing: '-0.3px' }}>
            Repository
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Everything teachable, organised as modules and topics. Shared across all course plans.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" size="small" sx={{ minHeight: 40 }} onClick={() => setModuleDialog(true)}>
            New module
          </Button>
          <Button variant="contained" size="small" startIcon={<AddIcon />} sx={{ minHeight: 40 }} onClick={() => openTopicDialog()}>
            Add topic
          </Button>
        </Stack>
      </Box>

      {/* Stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1.25, mb: 2 }}>
        {statCards.map((s) => (
          <Card key={s.label} elevation={0} sx={{ p: 1.75, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
            <Box
              sx={{
                width: 34,
                height: 34,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 1,
                bgcolor: alpha(s.color, 0.1),
                color: s.color,
                '& svg': { fontSize: 20 },
              }}
            >
              {s.icon}
            </Box>
            <Typography sx={{ fontSize: '1.4rem', fontWeight: 700, lineHeight: 1.2 }}>
              {modules === null ? <Skeleton width={32} /> : s.value}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {s.label}
            </Typography>
          </Card>
        ))}
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1, mb: 1.5, scrollbarWidth: 'none' }}>
        {FILTERS.map((f) => (
          <Chip
            key={f.value}
            label={f.label}
            clickable
            onClick={() => setFilter(f.value)}
            color={filter === f.value ? 'primary' : 'default'}
            variant={filter === f.value ? 'filled' : 'outlined'}
            sx={{ minHeight: 36, fontWeight: 600 }}
          />
        ))}
      </Box>

      {/* Modules */}
      {modules === null ? (
        <Stack spacing={1.5}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={72} sx={{ borderRadius: 3 }} />
          ))}
        </Stack>
      ) : modules.length === 0 ? (
        <EmptyState
          title="Start your curriculum"
          description="Create a module (like Drawing or NATA Foundation), then dump every topic you can think of into it."
          action={<Button variant="contained" onClick={() => setModuleDialog(true)}>Create the first module</Button>}
        />
      ) : (
        <Stack spacing={1.5}>
          {modules.map((m, mi) => {
            const color = moduleColor(m, mi);
            const visible = m.topics.filter(matchesFilter);
            const ready = m.topics.filter((t) => t.status === 'class_ready').length;
            const open = openModules[m.id] !== false;
            return (
              <Card key={m.id} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
                <Box
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenModules((p) => ({ ...p, [m.id]: !open }))}
                  onKeyDown={(e) => e.key === 'Enter' && setOpenModules((p) => ({ ...p, [m.id]: !open }))}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.75, cursor: 'pointer', minHeight: 56, '&:hover': { bgcolor: alpha(color, 0.03) } }}
                >
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      borderRadius: 2.5,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: color,
                      color: '#fff',
                      flexShrink: 0,
                    }}
                  >
                    <FolderOutlinedIcon />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', letterSpacing: '-0.2px' }}>{m.title}</Typography>
                    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Typography variant="caption" color="text.secondary">
                        {m.topics.length} topics, {ready} class ready
                      </Typography>
                      {m.exam_tags.map((e) => (
                        <Chip key={e} label={e.toUpperCase()} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.62rem' }} />
                      ))}
                    </Stack>
                  </Box>
                  <IconButton size="small" aria-label={open ? 'Collapse module' : 'Expand module'} sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease' }}>
                    <ExpandMoreIcon />
                  </IconButton>
                </Box>
                <Collapse in={open}>
                  <Box sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
                    {visible.length === 0 ? (
                      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', textAlign: 'center', py: 2 }}>
                        No topics match this filter
                      </Typography>
                    ) : (
                      visible.map((t) => (
                        <Box
                          key={t.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => router.push(`/teacher/curriculum/${t.id}`)}
                          onKeyDown={(e) => e.key === 'Enter' && router.push(`/teacher/curriculum/${t.id}`)}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.25,
                            px: 1.75,
                            py: 1.25,
                            minHeight: 52,
                            cursor: 'pointer',
                            borderBottom: '1px solid',
                            borderColor: alpha('#000', 0.04),
                            '&:hover': { bgcolor: alpha(color, 0.04) },
                          }}
                        >
                          <Box sx={{ width: 3, alignSelf: 'stretch', borderRadius: 1, bgcolor: color, flexShrink: 0 }} />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 600, fontSize: '0.87rem', lineHeight: 1.3 }}>{t.title}</Typography>
                            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.4 }} flexWrap="wrap" useFlexGap>
                              <PriorityBadge priority={t.priority} />
                              <TopicStatusChip status={t.status} />
                              {t.used_in_plans > 0 && (
                                <Chip label={`In ${t.used_in_plans} plan${t.used_in_plans > 1 ? 's' : ''}`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                              )}
                            </Stack>
                          </Box>
                          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0, color: 'text.disabled' }}>
                            <DeliveryIcon delivery={t.intended_delivery} />
                            <Typography variant="caption">{t.estimated_sessions} session{t.estimated_sessions > 1 ? 's' : ''}</Typography>
                          </Stack>
                        </Box>
                      ))
                    )}
                    <Button
                      fullWidth
                      startIcon={<AddIcon />}
                      onClick={() => openTopicDialog(m.id)}
                      sx={{ justifyContent: 'flex-start', px: 1.75, py: 1.25, minHeight: 48, fontWeight: 600, fontSize: '0.82rem' }}
                    >
                      Add a topic to {m.title}
                    </Button>
                  </Box>
                </Collapse>
              </Card>
            );
          })}
        </Stack>
      )}

      {/* Quick-add topic */}
      <Dialog open={!!topicDialog} onClose={() => setTopicDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Add topic</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Capture it fast. Write the class content later on the topic page.
          </Typography>
          <Stack spacing={2}>
            <TextField label="Title" value={tTitle} onChange={(e) => setTTitle(e.target.value)} autoFocus fullWidth placeholder="e.g. Shadows and light logic" />
            <TextField select label="Module" value={tModule} onChange={(e) => setTModule(e.target.value)} fullWidth>
              {(modules || []).map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {m.title}
                </MenuItem>
              ))}
            </TextField>
            <Stack direction="row" spacing={1.5}>
              <TextField select label="Priority" value={tPriority} onChange={(e) => setTPriority(e.target.value)} fullWidth>
                {PRIORITY_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select label="Sessions" value={tSessions} onChange={(e) => setTSessions(Number(e.target.value))} fullWidth>
                {[1, 2, 3, 4].map((n) => (
                  <MenuItem key={n} value={n}>
                    {n}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <TextField select label="Delivery" value={tDelivery} onChange={(e) => setTDelivery(e.target.value)} fullWidth>
              {DELIVERY_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setTopicDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={createTopic} disabled={busy || !tTitle.trim() || !tModule}>
            Add topic
          </Button>
        </DialogActions>
      </Dialog>

      {/* New module */}
      <Dialog open={moduleDialog} onClose={() => setModuleDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New module</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField label="Module name" value={mTitle} onChange={(e) => setMTitle(e.target.value)} autoFocus fullWidth placeholder="e.g. Drawing" />
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                Exams this module serves
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 0.75 }}>
                {EXAM_TAGS.map((e) => (
                  <Chip
                    key={e.value}
                    label={e.label}
                    clickable
                    color={mExams.includes(e.value) ? 'primary' : 'default'}
                    variant={mExams.includes(e.value) ? 'filled' : 'outlined'}
                    onClick={() => setMExams((p) => (p.includes(e.value) ? p.filter((x) => x !== e.value) : [...p, e.value]))}
                    sx={{ minHeight: 36 }}
                  />
                ))}
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setModuleDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={createModule} disabled={busy || !mTitle.trim()}>
            Create module
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={3500} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack?.sev || 'success'} onClose={() => setSnack(null)}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
