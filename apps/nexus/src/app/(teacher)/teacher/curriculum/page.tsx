'use client';

/**
 * Curriculum repository: org-wide subjects containing topics, shared by all
 * course plans. "Subject" is the user-facing name; the underlying table is
 * nexus_course_modules. Fast capture first (quick-add), full authoring on the
 * topic detail page. Edit / archive / delete live behind a per-row menu, gated
 * by ownership (admin does anything; a teacher only their own rows).
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
  Menu,
  ListItemIcon,
  ListItemText,
  Tooltip,
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
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {
  RepoModule,
  RepoTopic,
  PRIORITY_OPTIONS,
  DELIVERY_OPTIONS,
  PriorityBadge,
  TopicStatusChip,
  DeliveryIcon,
  moduleColor,
  MODULE_COLORS,
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

type SubjectDialogState = { editingId: string | null } | null;
type Confirm =
  | { kind: 'archive' | 'delete'; target: 'subject' | 'topic'; id: string; title: string; usedInPlans: number }
  | null;

export default function CurriculumPage() {
  const router = useRouter();
  const { loading: authLoading, user } = useNexusAuthContext();
  const authFetch = useAuthFetch();

  const [modules, setModules] = useState<RepoModule[] | null>(null);
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);
  const [busy, setBusy] = useState(false);

  // Quick-add topic
  const [topicDialog, setTopicDialog] = useState<{ moduleId?: string } | null>(null);
  const [tTitle, setTTitle] = useState('');
  const [tModule, setTModule] = useState('');
  const [tPriority, setTPriority] = useState('high');
  const [tDelivery, setTDelivery] = useState('live');
  const [tSessions, setTSessions] = useState(1);

  // Create / edit subject
  const [subjectDialog, setSubjectDialog] = useState<SubjectDialogState>(null);
  const [mTitle, setMTitle] = useState('');
  const [mExams, setMExams] = useState<string[]>([]);
  const [mColor, setMColor] = useState<string | null>(null);

  // Row action menus + confirm
  const [subjectMenu, setSubjectMenu] = useState<{ el: HTMLElement; module: RepoModule } | null>(null);
  const [topicMenu, setTopicMenu] = useState<{ el: HTMLElement; topic: RepoTopic } | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const canMutate = useCallback(
    (createdBy: string | null | undefined) =>
      user?.user_type === 'admin' || (!!createdBy && createdBy === user?.id),
    [user],
  );

  // How many of a subject's topics are placed in a course plan. > 0 means the
  // server blocks a hard delete (plan days would be blanked), so the UI steers
  // the teacher to Archive instead.
  const moduleUsage = useCallback(
    (m: RepoModule) => m.topics.reduce((sum, t) => sum + (t.used_in_plans || 0), 0),
    [],
  );

  const load = useCallback(async () => {
    try {
      const data = await authFetch('/api/curriculum?include_archived=1');
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

  const activeModules = useMemo(() => (modules || []).filter((m) => m.is_active), [modules]);
  const activeTopics = useMemo(
    () => activeModules.flatMap((m) => m.topics.filter((t) => t.is_active)),
    [activeModules],
  );
  const stats = useMemo(
    () => ({
      total: activeTopics.length,
      ready: activeTopics.filter((t) => t.status === 'class_ready').length,
      drafted: activeTopics.filter((t) => t.status === 'drafted').length,
      idea: activeTopics.filter((t) => t.status === 'idea').length,
    }),
    [activeTopics],
  );

  // Archived items (subjects + individually-archived topics under an active subject).
  const archivedSubjects = useMemo(() => (modules || []).filter((m) => !m.is_active), [modules]);
  const archivedTopics = useMemo(
    () =>
      activeModules.flatMap((m) =>
        m.topics.filter((t) => !t.is_active).map((t) => ({ topic: t, subjectTitle: m.title })),
      ),
    [activeModules],
  );
  const archivedCount = archivedSubjects.length + archivedTopics.length;

  const matchesFilter = (t: RepoTopic) => filter === 'all' || t.priority === filter || t.status === filter;

  // ---- Topic quick-add ----
  const openTopicDialog = (moduleId?: string) => {
    setTTitle('');
    setTModule(moduleId || activeModules?.[0]?.id || '');
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

  // ---- Subject create / edit ----
  const openNewSubject = () => {
    setMTitle('');
    setMExams([]);
    setMColor(null);
    setSubjectDialog({ editingId: null });
  };
  const openEditSubject = (m: RepoModule) => {
    setMTitle(m.title);
    setMExams(m.exam_tags || []);
    setMColor(m.color);
    setSubjectDialog({ editingId: m.id });
  };

  const saveSubject = async () => {
    if (!mTitle.trim()) return;
    setBusy(true);
    try {
      if (subjectDialog?.editingId) {
        await authFetch('/api/curriculum', {
          method: 'POST',
          body: JSON.stringify({
            action: 'update_module',
            module_id: subjectDialog.editingId,
            title: mTitle.trim(),
            exam_tags: mExams,
            color: mColor,
          }),
        });
        setSnack({ msg: 'Subject updated.', sev: 'success' });
      } else {
        await authFetch('/api/curriculum', {
          method: 'POST',
          body: JSON.stringify({ action: 'create_module', title: mTitle.trim(), exam_tags: mExams, color: mColor }),
        });
        setSnack({ msg: 'Subject created.', sev: 'success' });
      }
      setSubjectDialog(null);
      load();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to save subject', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };

  // ---- Archive / restore / delete ----
  const setSubjectActive = async (id: string, active: boolean) => {
    setBusy(true);
    try {
      await authFetch('/api/curriculum', {
        method: 'POST',
        body: JSON.stringify(active ? { action: 'update_module', module_id: id, is_active: true } : { action: 'archive_module', module_id: id }),
      });
      setSnack({ msg: active ? 'Subject restored.' : 'Subject archived.', sev: 'success' });
      load();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const deleteSubject = async (id: string) => {
    setBusy(true);
    try {
      await authFetch('/api/curriculum', {
        method: 'POST',
        body: JSON.stringify({ action: 'delete_module', module_id: id }),
      });
      setConfirm(null);
      setSnack({ msg: 'Subject deleted.', sev: 'success' });
      load();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to delete', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const setTopicActive = async (id: string, active: boolean) => {
    setBusy(true);
    try {
      await authFetch(`/api/curriculum/topics/${id}`, {
        method: active ? 'PATCH' : 'POST',
        body: JSON.stringify(active ? { is_active: true } : { action: 'archive_topic' }),
      });
      setSnack({ msg: active ? 'Topic restored.' : 'Topic archived.', sev: 'success' });
      load();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const deleteTopic = async (id: string) => {
    setBusy(true);
    try {
      await authFetch(`/api/curriculum/topics/${id}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'delete_topic' }),
      });
      setConfirm(null);
      setSnack({ msg: 'Topic deleted.', sev: 'success' });
      load();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to delete', sev: 'error' });
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
            Your subjects and topics, shared across all course plans. Build once, reuse every batch.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" size="small" sx={{ minHeight: 40 }} onClick={openNewSubject}>
            New subject
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

      {/* Subjects */}
      {modules === null ? (
        <Stack spacing={1.5}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={72} sx={{ borderRadius: 3 }} />
          ))}
        </Stack>
      ) : activeModules.length === 0 ? (
        <EmptyState
          title="Start your curriculum"
          description="Create a subject (like Mathematics, Aptitude or Drawing), then dump every topic you can think of into it."
          action={<Button variant="contained" onClick={openNewSubject}>Create the first subject</Button>}
        />
      ) : (
        <Stack spacing={1.5}>
          {activeModules.map((m, mi) => {
            const color = moduleColor(m, mi);
            const visible = m.topics.filter((t) => t.is_active).filter(matchesFilter);
            const ready = m.topics.filter((t) => t.is_active && t.status === 'class_ready').length;
            const activeCount = m.topics.filter((t) => t.is_active).length;
            const open = openModules[m.id] !== false;
            const mutable = canMutate(m.created_by);
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
                        {activeCount} topics, {ready} class ready
                      </Typography>
                      {m.exam_tags.map((e) => (
                        <Chip key={e} label={e.toUpperCase()} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.62rem' }} />
                      ))}
                    </Stack>
                  </Box>
                  <IconButton
                    size="small"
                    aria-label="Subject actions"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSubjectMenu({ el: e.currentTarget, module: m });
                    }}
                    sx={{ width: 40, height: 40 }}
                  >
                    <MoreVertIcon />
                  </IconButton>
                  <IconButton size="small" aria-label={open ? 'Collapse subject' : 'Expand subject'} tabIndex={-1} sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease' }}>
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
                          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0, color: 'text.disabled' }}>
                            <DeliveryIcon delivery={t.intended_delivery} />
                            <Typography variant="caption">{t.estimated_sessions} session{t.estimated_sessions > 1 ? 's' : ''}</Typography>
                            <IconButton
                              size="small"
                              aria-label="Topic actions"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTopicMenu({ el: e.currentTarget, topic: t });
                              }}
                              sx={{ width: 36, height: 36 }}
                            >
                              <MoreVertIcon sx={{ fontSize: 18 }} />
                            </IconButton>
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

          {/* Archived */}
          {archivedCount > 0 && (
            <>
              <Button
                onClick={() => setShowArchived((v) => !v)}
                startIcon={<ExpandMoreIcon sx={{ transform: showArchived ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />}
                sx={{ alignSelf: 'flex-start', color: 'text.secondary', fontWeight: 700, minHeight: 40 }}
              >
                {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
              </Button>
              <Collapse in={showArchived} unmountOnExit>
                <Stack spacing={1}>
                  {archivedSubjects.map((m) => (
                    <ArchivedRow
                      key={m.id}
                      title={m.title}
                      subtitle="Subject"
                      canMutate={canMutate(m.created_by)}
                      busy={busy}
                      onRestore={() => setSubjectActive(m.id, true)}
                      onDelete={() => setConfirm({ kind: 'delete', target: 'subject', id: m.id, title: m.title, usedInPlans: moduleUsage(m) })}
                    />
                  ))}
                  {archivedTopics.map(({ topic, subjectTitle }) => (
                    <ArchivedRow
                      key={topic.id}
                      title={topic.title}
                      subtitle={`Topic · ${subjectTitle}`}
                      canMutate={canMutate(topic.created_by)}
                      busy={busy}
                      onRestore={() => setTopicActive(topic.id, true)}
                      onDelete={() =>
                        setConfirm({ kind: 'delete', target: 'topic', id: topic.id, title: topic.title, usedInPlans: topic.used_in_plans })
                      }
                    />
                  ))}
                </Stack>
              </Collapse>
            </>
          )}
        </Stack>
      )}

      {/* Subject actions menu */}
      <Menu anchorEl={subjectMenu?.el} open={!!subjectMenu} onClose={() => setSubjectMenu(null)}>
        <MenuItem
          disabled={!subjectMenu || !canMutate(subjectMenu.module.created_by)}
          onClick={() => {
            if (subjectMenu) openEditSubject(subjectMenu.module);
            setSubjectMenu(null);
          }}
        >
          <ListItemIcon><EditOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Edit subject</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={!subjectMenu || !canMutate(subjectMenu.module.created_by)}
          onClick={() => {
            if (subjectMenu) setConfirm({ kind: 'archive', target: 'subject', id: subjectMenu.module.id, title: subjectMenu.module.title, usedInPlans: moduleUsage(subjectMenu.module) });
            setSubjectMenu(null);
          }}
        >
          <ListItemIcon><ArchiveOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText
            primary="Archive (hide)"
            secondary={subjectMenu && moduleUsage(subjectMenu.module) > 0 ? 'In use by a course plan. Archive to hide it.' : undefined}
            secondaryTypographyProps={{ fontSize: '0.7rem' }}
          />
        </MenuItem>
        <Tooltip
          title={subjectMenu && moduleUsage(subjectMenu.module) > 0 ? 'A topic here is used in a course plan. Archive it instead.' : ''}
          placement="left"
        >
          <span>
            <MenuItem
              disabled={!subjectMenu || !canMutate(subjectMenu.module.created_by) || moduleUsage(subjectMenu.module) > 0}
              onClick={() => {
                if (subjectMenu) setConfirm({ kind: 'delete', target: 'subject', id: subjectMenu.module.id, title: subjectMenu.module.title, usedInPlans: moduleUsage(subjectMenu.module) });
                setSubjectMenu(null);
              }}
              sx={{ color: 'error.main' }}
            >
              <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>
              <ListItemText>Delete permanently</ListItemText>
            </MenuItem>
          </span>
        </Tooltip>
      </Menu>

      {/* Topic actions menu */}
      <Menu anchorEl={topicMenu?.el} open={!!topicMenu} onClose={() => setTopicMenu(null)}>
        <MenuItem
          onClick={() => {
            if (topicMenu) router.push(`/teacher/curriculum/${topicMenu.topic.id}`);
            setTopicMenu(null);
          }}
        >
          <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Open / edit</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={!topicMenu || !canMutate(topicMenu.topic.created_by)}
          onClick={() => {
            if (topicMenu) setConfirm({ kind: 'archive', target: 'topic', id: topicMenu.topic.id, title: topicMenu.topic.title, usedInPlans: topicMenu.topic.used_in_plans });
            setTopicMenu(null);
          }}
        >
          <ListItemIcon><ArchiveOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Archive (hide)</ListItemText>
        </MenuItem>
        <Tooltip
          title={topicMenu && topicMenu.topic.used_in_plans > 0 ? 'Used in a course plan. Archive it instead.' : ''}
          placement="left"
        >
          <span>
            <MenuItem
              disabled={!topicMenu || !canMutate(topicMenu.topic.created_by) || topicMenu.topic.used_in_plans > 0}
              onClick={() => {
                if (topicMenu) setConfirm({ kind: 'delete', target: 'topic', id: topicMenu.topic.id, title: topicMenu.topic.title, usedInPlans: topicMenu.topic.used_in_plans });
                setTopicMenu(null);
              }}
              sx={{ color: 'error.main' }}
            >
              <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>
              <ListItemText>Delete permanently</ListItemText>
            </MenuItem>
          </span>
        </Tooltip>
      </Menu>

      {/* Quick-add topic */}
      <Dialog open={!!topicDialog} onClose={() => setTopicDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Add topic</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Capture it fast. Write the class content later on the topic page.
          </Typography>
          <Stack spacing={2}>
            <TextField label="Title" value={tTitle} onChange={(e) => setTTitle(e.target.value)} autoFocus fullWidth placeholder="e.g. Shadows and light logic" />
            <TextField select label="Subject" value={tModule} onChange={(e) => setTModule(e.target.value)} fullWidth>
              {activeModules.map((m) => (
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

      {/* Create / edit subject */}
      <Dialog open={!!subjectDialog} onClose={() => setSubjectDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{subjectDialog?.editingId ? 'Edit subject' : 'New subject'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField label="Subject name" value={mTitle} onChange={(e) => setMTitle(e.target.value)} autoFocus fullWidth placeholder="e.g. Mathematics, Aptitude, Drawing" />
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                Exams this subject serves
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
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                Colour
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 0.75, flexWrap: 'wrap' }} useFlexGap>
                {MODULE_COLORS.map((c) => (
                  <Box
                    key={c}
                    role="button"
                    aria-label={`Colour ${c}`}
                    onClick={() => setMColor(c)}
                    sx={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      bgcolor: c,
                      cursor: 'pointer',
                      border: '3px solid',
                      borderColor: mColor === c ? alpha(c, 0.35) : 'transparent',
                      boxShadow: mColor === c ? `0 0 0 2px ${c}` : 'none',
                    }}
                  />
                ))}
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSubjectDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveSubject} disabled={busy || !mTitle.trim()}>
            {subjectDialog?.editingId ? 'Save changes' : 'Create subject'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm archive / delete */}
      <Dialog open={!!confirm} onClose={() => !busy && setConfirm(null)} maxWidth="xs" fullWidth>
        {confirm && (
          <>
            <DialogTitle>
              {confirm.kind === 'archive' ? `Archive “${confirm.title}”?` : `Delete “${confirm.title}” permanently?`}
            </DialogTitle>
            <DialogContent>
              {confirm.kind === 'archive' ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  It is hidden from the repository. You can bring it back any time from “Show archived”.
                  {confirm.target === 'subject' ? ' Its topics are hidden with it.' : ''}
                </Typography>
              ) : (
                <Alert severity="error" sx={{ mt: 0.5 }}>
                  This cannot be undone. The {confirm.target}
                  {confirm.target === 'subject' ? ' and all its topics' : ''} are removed for good.
                  {confirm.usedInPlans > 0
                    ? confirm.target === 'subject'
                      ? ' A topic here is placed in a course plan, so it must be archived, not deleted.'
                      : ' It is placed in a course plan, so it must be archived, not deleted.'
                    : ''}
                </Alert>
              )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setConfirm(null)} disabled={busy}>Cancel</Button>
              {confirm.kind === 'archive' ? (
                <Button
                  variant="contained"
                  color="warning"
                  disabled={busy}
                  onClick={() => {
                    if (confirm.target === 'subject') setSubjectActive(confirm.id, false).then(() => setConfirm(null));
                    else setTopicActive(confirm.id, false).then(() => setConfirm(null));
                  }}
                >
                  Archive
                </Button>
              ) : (
                <Button
                  variant="contained"
                  color="error"
                  disabled={busy || confirm.usedInPlans > 0}
                  onClick={() => (confirm.target === 'subject' ? deleteSubject(confirm.id) : deleteTopic(confirm.id))}
                >
                  Delete permanently
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={3500} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack?.sev || 'success'} onClose={() => setSnack(null)}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}

/** One archived subject/topic row with Restore + Delete. */
function ArchivedRow({
  title,
  subtitle,
  canMutate,
  busy,
  onRestore,
  onDelete,
}: {
  title: string;
  subtitle: string;
  canMutate: boolean;
  busy: boolean;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <Card elevation={0} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2.5, opacity: 0.75 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }} noWrap>{title}</Typography>
          <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
        </Box>
        <Button size="small" startIcon={<UnarchiveOutlinedIcon sx={{ fontSize: 16 }} />} onClick={onRestore} disabled={busy || !canMutate} sx={{ minHeight: 36, fontWeight: 700 }}>
          Restore
        </Button>
        <Button size="small" color="error" startIcon={<DeleteOutlineIcon sx={{ fontSize: 16 }} />} onClick={onDelete} disabled={busy || !canMutate} sx={{ minHeight: 36, fontWeight: 700 }}>
          Delete
        </Button>
      </Stack>
    </Card>
  );
}
