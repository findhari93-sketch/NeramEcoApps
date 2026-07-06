'use client';

/**
 * Topic detail: author everything a teacher needs to run a class from this topic.
 * Tabs: Overview | Activities and drills | Resources | Tests.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Card,
  Chip,
  Button,
  IconButton,
  Skeleton,
  Tabs,
  Tab,
  TextField,
  MenuItem,
  Stack,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Switch,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import YouTubeIcon from '@mui/icons-material/YouTube';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import {
  PRIORITY_OPTIONS,
  DELIVERY_OPTIONS,
  PriorityBadge,
  TopicStatusChip,
  useAuthFetch,
} from '@/components/curriculum/shared';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { ASSIGNMENT_ATTACHMENTS_FOLDER_ID } from '@/lib/assignment-constants';
import type { NexusCourseTopicDetail } from '@neram/database';

export default function TopicDetailPage() {
  const { topicId } = useParams<{ topicId: string }>();
  const router = useRouter();
  const { loading: authLoading, activeClassroom, getToken } = useNexusAuthContext();
  const authFetch = useAuthFetch();

  const [topic, setTopic] = useState<NexusCourseTopicDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

  // Editable content fields (saved on blur / explicit save)
  const [summary, setSummary] = useState('');
  const [activities, setActivities] = useState('');
  const [drills, setDrills] = useState('');

  // Add-resource dialog
  const [resDialog, setResDialog] = useState(false);
  const [resKind, setResKind] = useState<'link' | 'youtube' | 'study_file'>('link');
  const [resSection, setResSection] = useState<'resource' | 'drill'>('resource');
  const [resTitle, setResTitle] = useState('');
  const [resUrl, setResUrl] = useState('');
  const [resFile, setResFile] = useState<File | null>(null);
  const [uploadingRes, setUploadingRes] = useState(false);

  // Link-test dialog
  const [testDialog, setTestDialog] = useState(false);
  const [availableTests, setAvailableTests] = useState<{ id: string; title: string }[]>([]);

  // Schedule-to-plan dialog
  const [planDialog, setPlanDialog] = useState(false);
  const [availablePlans, setAvailablePlans] = useState<{ id: string; title: string; status: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await authFetch(`/api/curriculum/topics/${topicId}`);
      setTopic(data.topic);
      setSummary(data.topic.summary || '');
      setActivities(data.topic.activities || '');
      setDrills(data.topic.drills || '');
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to load topic', sev: 'error' });
    } finally {
      setLoading(false);
    }
  }, [authFetch, topicId]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  const patch = async (updates: Record<string, unknown>, msg?: string) => {
    setBusy(true);
    try {
      const data = await authFetch(`/api/curriculum/topics/${topicId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      setTopic((prev) => (prev ? { ...prev, ...data.topic } : prev));
      if (msg) setSnack({ msg, sev: 'success' });
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to save', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const post = async (body: Record<string, unknown>, msg: string) => {
    setBusy(true);
    try {
      await authFetch(`/api/curriculum/topics/${topicId}`, { method: 'POST', body: JSON.stringify(body) });
      setSnack({ msg, sev: 'success' });
      load();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to save', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const addResource = async () => {
    if (!resTitle.trim()) return;
    // File resources upload to the system study folder first, then link.
    if (resKind === 'study_file') {
      if (!resFile) {
        setSnack({ msg: 'Choose a file to upload.', sev: 'error' });
        return;
      }
      setUploadingRes(true);
      try {
        const token = await getToken();
        if (!token) throw new Error('Your session expired. Sign in again.');
        const form = new FormData();
        form.append('file', resFile);
        form.append('folder_id', ASSIGNMENT_ATTACHMENTS_FOLDER_ID);
        form.append('title', resTitle.trim());
        const upRes = await fetch('/api/study-materials/files', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        const upData = await upRes.json().catch(() => ({}));
        if (!upRes.ok) throw new Error(upData.error || 'Upload failed');
        setResDialog(false);
        setResFile(null);
        await post(
          {
            action: 'add_resource',
            kind: 'study_file',
            title: resTitle.trim(),
            study_file_id: upData.file.id,
            section: resSection,
          },
          resSection === 'drill' ? 'Drill file added.' : 'File added.',
        );
      } catch (err) {
        setSnack({ msg: err instanceof Error ? err.message : 'Upload failed', sev: 'error' });
      } finally {
        setUploadingRes(false);
      }
      return;
    }
    setResDialog(false);
    await post(
      { action: 'add_resource', kind: resKind, title: resTitle.trim(), url: resUrl || null, section: resSection },
      'Resource added.',
    );
  };

  const openPlanDialog = async () => {
    setPlanDialog(true);
    try {
      const data = await authFetch('/api/teaching-plans');
      setAvailablePlans(
        (data.plans || []).filter((p: { status: string }) => ['draft', 'active'].includes(p.status)),
      );
    } catch {
      setAvailablePlans([]);
    }
  };

  const addToPlan = async (planId: string) => {
    setPlanDialog(false);
    setBusy(true);
    try {
      await authFetch(`/api/teaching-plans/${planId}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'add_entries', entries: [{ topic_id: topicId }] }),
      });
      setSnack({ msg: 'Added to the plan. Arrange its day in the Builder.', sev: 'success' });
      router.push(`/teacher/course-plans/${planId}`);
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to add to plan', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const openTestDialog = async () => {
    setTestDialog(true);
    try {
      const data = await authFetch(`/api/tests${activeClassroom ? `?classroom_id=${activeClassroom.id}` : ''}`);
      const tests = Array.isArray(data.tests) ? data.tests : Array.isArray(data) ? data : [];
      const linked = new Set((topic?.tests || []).map((l) => l.test_id));
      setAvailableTests(tests.filter((t: { id: string }) => !linked.has(t.id)));
    } catch {
      setAvailableTests([]);
    }
  };

  if (loading || !topic) {
    return (
      <Box>
        <Skeleton width={140} height={32} />
        <Skeleton variant="rounded" height={120} sx={{ mt: 2, borderRadius: 3 }} />
        <Skeleton variant="rounded" height={240} sx={{ mt: 2, borderRadius: 3 }} />
      </Box>
    );
  }

  const resourceIcon = (kind: string) =>
    kind === 'youtube' ? <YouTubeIcon color="error" /> : kind === 'study_file' ? <InsertDriveFileOutlinedIcon color="primary" /> : <LinkOutlinedIcon color="info" />;

  return (
    <Box>
      <Button startIcon={<ArrowBackIcon />} onClick={() => router.push('/teacher/curriculum')} sx={{ mb: 1, minHeight: 44, color: 'text.secondary', fontWeight: 600 }}>
        Repository
      </Button>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontSize: { xs: '1.2rem', sm: '1.4rem' }, letterSpacing: '-0.3px' }}>
            {topic.title}
          </Typography>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.75 }} flexWrap="wrap" useFlexGap>
            <PriorityBadge priority={topic.priority} />
            <TopicStatusChip status={topic.status} />
            {topic.module && <Chip label={topic.module.title} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.68rem' }} />}
            <Chip label={`${topic.estimated_sessions} session${topic.estimated_sessions > 1 ? 's' : ''}`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.68rem' }} />
            {topic.used_in_plans > 0 && (
              <Chip label={`In ${topic.used_in_plans} plan${topic.used_in_plans > 1 ? 's' : ''}`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.68rem' }} />
            )}
          </Stack>
        </Box>
        {topic.status !== 'class_ready' && (
          <Button
            variant="contained"
            size="small"
            startIcon={<CheckCircleOutlineIcon />}
            disabled={busy}
            onClick={() => patch({ status: 'class_ready' }, 'Marked class ready. Any teacher can now run this topic.')}
            sx={{ minHeight: 40 }}
          >
            Mark class ready
          </Button>
        )}
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tab label="Overview" sx={{ minHeight: 44 }} />
        <Tab label="Activities and drills" sx={{ minHeight: 44 }} />
        <Tab label={`Resources (${topic.resources.length})`} sx={{ minHeight: 44 }} />
        <Tab label={`Tests (${topic.tests.length})`} sx={{ minHeight: 44 }} />
      </Tabs>

      {tab === 0 && (
        <Stack spacing={2}>
          <Card elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Summary: what this topic covers and how the class runs
            </Typography>
            <TextField
              multiline
              minRows={5}
              fullWidth
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              onBlur={() => summary !== (topic.summary || '') && patch({ summary }, 'Summary saved.')}
              placeholder="What should students be able to do after this class? How does the session run (demo, guided work, review)? What materials are needed?"
            />
          </Card>
          <Card elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
              Classification
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField select label="Priority" value={topic.priority} onChange={(e) => patch({ priority: e.target.value })} fullWidth>
                {PRIORITY_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select label="Delivery" value={topic.intended_delivery} onChange={(e) => patch({ intended_delivery: e.target.value })} fullWidth>
                {DELIVERY_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select label="Estimated sessions" value={topic.estimated_sessions} onChange={(e) => patch({ estimated_sessions: Number(e.target.value) })} fullWidth>
                {[1, 2, 3, 4].map((n) => (
                  <MenuItem key={n} value={n}>
                    {n}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          </Card>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>Visible to students</Typography>
                <Typography variant="caption" color="text.secondary">
                  Shows the topic in student-facing lists once shipped
                </Typography>
              </Box>
              <Switch
                checked={topic.visible_to_students ?? false}
                disabled={busy}
                onChange={(e) => patch({ visible_to_students: e.target.checked }, e.target.checked ? 'Visible to students.' : 'Hidden from students.')}
              />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5 }}>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>Self-learning module</Typography>
                <Typography variant="caption" color="text.secondary">
                  Students study it themselves; used by catch-up tracks
                </Typography>
              </Box>
              <Switch
                checked={topic.is_self_learning ?? false}
                disabled={busy}
                onChange={(e) =>
                  patch(
                    e.target.checked
                      ? { is_self_learning: true, visible_to_students: true }
                      : { is_self_learning: false },
                    e.target.checked ? 'Marked as a self-learning module and made visible.' : 'No longer a self-learning module.',
                  )
                }
              />
            </Box>
          </Card>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button variant="contained" startIcon={<CalendarMonthOutlinedIcon />} onClick={openPlanDialog} sx={{ minHeight: 48 }}>
              Schedule to a class day
            </Button>
            {!topic.is_self_learning && (
              <Button
                variant="outlined"
                startIcon={<MenuBookOutlinedIcon />}
                disabled={busy}
                onClick={() =>
                  patch({ is_self_learning: true, visible_to_students: true }, 'Converted to a self-learning module and shared with students.')
                }
                sx={{ minHeight: 48 }}
              >
                Convert to self-learning module
              </Button>
            )}
          </Stack>
        </Stack>
      )}

      {tab === 1 && (
        <Stack spacing={2}>
          <Card elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Class activities
            </Typography>
            <TextField
              multiline
              minRows={4}
              fullWidth
              value={activities}
              onChange={(e) => setActivities(e.target.value)}
              onBlur={() => activities !== (topic.activities || '') && patch({ activities }, 'Activities saved.')}
              placeholder="Warm-up, main exercise, pin-up review..."
            />
          </Card>
          <Card elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Drills and practice
            </Typography>
            <TextField
              multiline
              minRows={4}
              fullWidth
              value={drills}
              onChange={(e) => setDrills(e.target.value)}
              onBlur={() => drills !== (topic.drills || '') && patch({ drills }, 'Drills saved.')}
              placeholder="Daily take-home drills until the next class..."
            />
          </Card>
        </Stack>
      )}

      {tab === 2 && (
        <Box>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
            {topic.resources.length === 0 ? (
              <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', py: 3 }}>
                No resources yet. Attach reference links, videos or files a teacher needs for this class.
              </Typography>
            ) : (
              <List disablePadding>
                {topic.resources.map((r) => (
                  <ListItem
                    key={r.id}
                    divider
                    secondaryAction={
                      <IconButton edge="end" aria-label="Remove resource" onClick={() => post({ action: 'remove_resource', resource_id: r.id }, 'Resource removed.')}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    }
                  >
                    <ListItemIcon sx={{ minWidth: 40 }}>{resourceIcon(r.kind)}</ListItemIcon>
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          <span>{r.title}</span>
                          {r.section === 'drill' && (
                            <Chip label="drill" size="small" sx={{ height: 18, fontSize: '0.6rem' }} />
                          )}
                        </Stack>
                      }
                      secondary={r.kind === 'youtube' ? 'YouTube' : r.kind === 'study_file' ? 'Uploaded file' : r.url}
                      primaryTypographyProps={{ fontWeight: 600, fontSize: '0.88rem' }}
                      secondaryTypographyProps={{ fontSize: '0.74rem', noWrap: true }}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Card>
          <Button startIcon={<AddIcon />} variant="outlined" size="small" sx={{ mt: 1.5, minHeight: 40 }} onClick={() => { setResKind('link'); setResSection('resource'); setResTitle(''); setResUrl(''); setResFile(null); setResDialog(true); }}>
            Add resource
          </Button>
        </Box>
      )}

      {tab === 3 && (
        <Box>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
            {topic.tests.length === 0 ? (
              <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', py: 3 }}>
                No tests linked. Link an existing test so it travels with this topic into every plan.
              </Typography>
            ) : (
              <List disablePadding>
                {topic.tests.map((l) => (
                  <ListItem
                    key={l.id}
                    divider
                    secondaryAction={
                      <IconButton edge="end" aria-label="Unlink test" onClick={() => post({ action: 'unlink_test', test_id: l.test_id }, 'Test unlinked.')}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    }
                  >
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      <QuizOutlinedIcon sx={{ color: '#00897B' }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={l.test?.title || 'Test'}
                      secondary={l.purpose === 'quiz' ? 'Quiz (evaluates a self-learning module)' : 'Practice test'}
                      primaryTypographyProps={{ fontWeight: 600, fontSize: '0.88rem' }}
                      secondaryTypographyProps={{ fontSize: '0.74rem' }}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Card>
          <Button startIcon={<AddIcon />} variant="outlined" size="small" sx={{ mt: 1.5, minHeight: 40 }} onClick={openTestDialog}>
            Link a test
          </Button>
        </Box>
      )}

      {/* Add resource */}
      <Dialog open={resDialog} onClose={() => setResDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add resource</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField
              select
              label="Type"
              value={resKind}
              onChange={(e) => setResKind(e.target.value as 'link' | 'youtube' | 'study_file')}
              fullWidth
            >
              <MenuItem value="link">Link</MenuItem>
              <MenuItem value="youtube">YouTube video</MenuItem>
              <MenuItem value="study_file">Upload file (PDF or image)</MenuItem>
            </TextField>
            <TextField select label="Section" value={resSection} onChange={(e) => setResSection(e.target.value as 'resource' | 'drill')} fullWidth helperText="Drill files can be attached to a class assignment in one tap.">
              <MenuItem value="resource">Resource</MenuItem>
              <MenuItem value="drill">Drill (take-home practice)</MenuItem>
            </TextField>
            <TextField label="Title" value={resTitle} onChange={(e) => setResTitle(e.target.value)} fullWidth autoFocus />
            {resKind === 'study_file' ? (
              <Button variant="outlined" component="label" sx={{ minHeight: 48, textTransform: 'none' }}>
                {resFile ? resFile.name : 'Choose PDF or image'}
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  hidden
                  onChange={(e) => setResFile(e.target.files?.[0] || null)}
                />
              </Button>
            ) : (
              <TextField label="URL" value={resUrl} onChange={(e) => setResUrl(e.target.value)} fullWidth placeholder="https://..." />
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setResDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={busy || uploadingRes || !resTitle.trim() || (resKind === 'study_file' && !resFile)}
            onClick={addResource}
          >
            {uploadingRes ? 'Uploading...' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Link test */}
      <Dialog open={testDialog} onClose={() => setTestDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Link a test</DialogTitle>
        <DialogContent>
          {availableTests.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              No tests available to link. Create one in the Tests module first.
            </Typography>
          ) : (
            <List disablePadding>
              {availableTests.map((t) => (
                <ListItem
                  key={t.id}
                  component="button"
                  onClick={() => {
                    setTestDialog(false);
                    post({ action: 'link_test', test_id: t.id }, 'Test linked to this topic.');
                  }}
                  sx={{ borderRadius: 2, minHeight: 48, cursor: 'pointer', width: '100%', textAlign: 'left', border: 'none', bgcolor: 'transparent', '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <QuizOutlinedIcon sx={{ color: '#00897B' }} />
                  </ListItemIcon>
                  <ListItemText primary={t.title} primaryTypographyProps={{ fontWeight: 600, fontSize: '0.88rem' }} />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setTestDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Schedule to a plan */}
      <Dialog open={planDialog} onClose={() => setPlanDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add to a course plan</DialogTitle>
        <DialogContent>
          {availablePlans.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              No draft or active plans. Create one under Course Plans first.
            </Typography>
          ) : (
            <List disablePadding>
              {availablePlans.map((p) => (
                <ListItem
                  key={p.id}
                  component="button"
                  onClick={() => addToPlan(p.id)}
                  sx={{ borderRadius: 2, minHeight: 48, cursor: 'pointer', width: '100%', textAlign: 'left', border: 'none', bgcolor: 'transparent', '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <CalendarMonthOutlinedIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText
                    primary={p.title}
                    secondary={p.status === 'active' ? 'Active, will be tagged unplanned' : 'Draft'}
                    primaryTypographyProps={{ fontWeight: 600, fontSize: '0.88rem' }}
                    secondaryTypographyProps={{ fontSize: '0.74rem' }}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPlanDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack?.sev || 'success'} onClose={() => setSnack(null)}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
