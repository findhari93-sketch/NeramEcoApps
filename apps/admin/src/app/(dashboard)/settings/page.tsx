'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Chip,
  Alert,
  AlertTitle,
  CircularProgress,
  InputAdornment,
  Divider,
  FormHelperText,
} from '@neram/ui';
import SettingsIcon from '@mui/icons-material/Settings';
import SaveIcon from '@mui/icons-material/Save';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import AddIcon from '@mui/icons-material/Add';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import RefreshIcon from '@mui/icons-material/Refresh';
import type { LifecycleRules } from '@neram/database';
import {
  validateRulesForm,
  addReminderDay,
  mapRuleServerErrors,
  RULE_LIMITS,
  type RulesFormValues,
  type RulesFormErrors,
  type RuleNumberKey,
} from '@/lib/ops-format';
import { OpsPageHeader, OpsSkeleton, FOCUS_RING, TARGET_44 } from '@/components/ops/OpsUi';

const NUMBER_FIELDS: Array<{ key: RuleNumberKey; label: string; help: string }> = [
  {
    key: 'student_quiet_days',
    label: 'Check in with a quiet student after',
    help: 'Suggests a check-in when an enrolled student shows no activity for this many days.',
  },
  {
    key: 'not_started_decision_days',
    label: 'Decide on a student who has not started after',
    help: 'Days after enrolment before a student who never opened Nexus is raised for a decision.',
  },
  {
    key: 'lead_archive_days',
    label: 'Suggest archiving a silent lead after',
    help: 'Leads with no activity for this many days are suggested for the archive. Archiving is reversible and keeps sign-in on.',
  },
  {
    key: 'archived_deactivate_days',
    label: 'Suggest turning off sign-in after',
    help: 'Archived accounts silent for this many days are suggested for turning off sign-in. Must be longer than the archive rule.',
  },
];

function toForm(rules: LifecycleRules): RulesFormValues {
  return {
    student_quiet_days: String(rules.student_quiet_days),
    lead_archive_days: String(rules.lead_archive_days),
    archived_deactivate_days: String(rules.archived_deactivate_days),
    not_started_decision_days: String(rules.not_started_decision_days),
    suggest_graduation: !!rules.suggest_graduation,
    join_reminder_days: [...(rules.join_reminder_days || [])].sort((a, b) => a - b),
  };
}

function toRules(v: RulesFormValues): LifecycleRules {
  return {
    student_quiet_days: Number(v.student_quiet_days),
    lead_archive_days: Number(v.lead_archive_days),
    archived_deactivate_days: Number(v.archived_deactivate_days),
    not_started_decision_days: Number(v.not_started_decision_days),
    suggest_graduation: v.suggest_graduation,
    join_reminder_days: v.join_reminder_days,
  };
}

function sameForm(a: RulesFormValues | null, b: RulesFormValues | null): boolean {
  return !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
}

export default function SettingsPage() {
  const [saved, setSaved] = useState<RulesFormValues | null>(null);
  const [defaults, setDefaults] = useState<RulesFormValues | null>(null);
  const [form, setForm] = useState<RulesFormValues | null>(null);
  const [touched, setTouched] = useState<Partial<Record<keyof RulesFormValues, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<RulesFormErrors>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [dayInput, setDayInput] = useState('');
  const [dayError, setDayError] = useState('');
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/settings/lifecycle-rules', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load the rules.');
      const current = toForm(data.rules);
      setSaved(current);
      setForm(current);
      setDefaults(toForm(data.defaults));
      setTouched({});
      setServerErrors({});
    } catch (e: any) {
      setLoadError(e?.message || 'Could not load the rules.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const clientErrors = useMemo(() => (form ? validateRulesForm(form) : {}), [form]);
  const dirty = !!form && !sameForm(form, saved);
  const hasErrors = Object.keys(clientErrors).length > 0;

  const fieldError = (key: keyof RulesFormErrors): string | undefined =>
    serverErrors[key] || (touched[key as keyof RulesFormValues] ? clientErrors[key] : undefined);

  const update = (patch: Partial<RulesFormValues>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setServerErrors({});
    setSavedNotice(false);
    setRunResult(null);
  };

  const addDay = () => {
    if (!form) return;
    const result = addReminderDay(form.join_reminder_days, dayInput);
    if (result.error) {
      setDayError(result.error);
      return;
    }
    setDayError('');
    setDayInput('');
    update({ join_reminder_days: result.days });
    setTouched((t) => ({ ...t, join_reminder_days: true }));
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setTouched({
      student_quiet_days: true,
      lead_archive_days: true,
      archived_deactivate_days: true,
      not_started_decision_days: true,
      join_reminder_days: true,
    });
    if (hasErrors) return;
    setSaving(true);
    setServerErrors({});
    try {
      const res = await fetch('/api/settings/lifecycle-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: toRules(form) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 400) {
        setServerErrors(mapRuleServerErrors(data.error));
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Could not save the rules.');
      const next = toForm(data.rules);
      setSaved(next);
      setForm(next);
      setSavedNotice(true);
    } catch (err: any) {
      setServerErrors({ form: err?.message || 'Could not save the rules.' });
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch('/api/lifecycle/run', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not refresh suggestions.');
      const added = Number(data.added || 0);
      setRunResult({
        ok: true,
        text: added === 0 ? 'Suggestions refreshed. Nothing new.' : `Suggestions refreshed. ${added} new ${added === 1 ? 'suggestion' : 'suggestions'}.`,
      });
    } catch (err: any) {
      setRunResult({ ok: false, text: err?.message || 'Could not refresh suggestions.' });
    } finally {
      setRunning(false);
    }
  };

  const resetToDefaults = () => {
    if (!defaults) return;
    update(defaults);
    setTouched({});
    setDayError('');
  };

  return (
    <Box sx={{ maxWidth: 960 }}>
      <OpsPageHeader icon={SettingsIcon} title="Settings" subtitle="Rules for lifecycle suggestions, and who gets staff notifications." />

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1fr) 280px' }, alignItems: 'start' }}>
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
            <Typography variant="h6" component="h2" fontWeight={700}>
              Lifecycle rules
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              A daily check uses these rules to suggest actions on the Lifecycle page. It never acts on anyone by itself.
            </Typography>
          </Box>
          <Divider />

          {loading ? (
            <Box sx={{ p: { xs: 2, md: 3 }, display: 'grid', gap: 2 }} aria-busy="true" aria-label="Loading the rules">
              {[0, 1, 2, 3, 4].map((i) => (
                <OpsSkeleton key={i} variant="rounded" height={72} />
              ))}
            </Box>
          ) : loadError || !form ? (
            <Box sx={{ p: { xs: 2, md: 3 } }}>
              <Alert
                severity="error"
                action={
                  <Button color="inherit" startIcon={<RefreshIcon />} onClick={load} sx={{ textTransform: 'none', ...TARGET_44 }}>
                    Try again
                  </Button>
                }
              >
                {loadError || 'Could not load the rules.'}
              </Alert>
            </Box>
          ) : (
            <Box component="form" noValidate onSubmit={save} sx={{ p: { xs: 2, md: 3 }, display: 'grid', gap: 2.5 }}>
              {serverErrors.form && <Alert severity="error">{serverErrors.form}</Alert>}

              <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                {NUMBER_FIELDS.map(({ key, label, help }) => {
                  const [min, max] = RULE_LIMITS[key];
                  const err = fieldError(key);
                  return (
                    <TextField
                      key={key}
                      id={`rule-${key}`}
                      label={label}
                      value={form[key]}
                      onChange={(e) => update({ [key]: e.target.value.replace(/[^\d]/g, '') } as Partial<RulesFormValues>)}
                      onBlur={() => setTouched((t) => ({ ...t, [key]: true }))}
                      error={!!err}
                      helperText={err ? err : `${help} ${min} to ${max} days.`}
                      inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', 'aria-invalid': !!err }}
                      InputProps={{ endAdornment: <InputAdornment position="end">days</InputAdornment> }}
                      fullWidth
                    />
                  );
                })}
              </Box>

              <Box>
                <Typography variant="subtitle2" component="h3" fontWeight={700} id="reminder-days-label">
                  Join reminders
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Days after enrolment when a student who has not joined the class gets a reminder. Up to 5 days, each from 1 to 30.
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }} aria-labelledby="reminder-days-label">
                  {form.join_reminder_days.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      No reminder days.
                    </Typography>
                  )}
                  {form.join_reminder_days.map((d) => (
                    <Chip
                      key={d}
                      label={`Day ${d}`}
                      aria-label={`Day ${d}. Press Delete to remove it.`}
                      onDelete={() => {
                        update({ join_reminder_days: form.join_reminder_days.filter((x) => x !== d) });
                        setTouched((t) => ({ ...t, join_reminder_days: true }));
                      }}
                      sx={{ height: 44, px: 0.5, fontWeight: 600, ...FOCUS_RING, '& .MuiChip-deleteIcon': { fontSize: 22 } }}
                    />
                  ))}
                </Box>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', maxWidth: 360 }}>
                  <TextField
                    label="Add a day"
                    value={dayInput}
                    onChange={(e) => {
                      setDayInput(e.target.value.replace(/[^\d]/g, ''));
                      setDayError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addDay();
                      }
                    }}
                    error={!!dayError}
                    helperText={dayError || ' '}
                    inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
                    sx={{ flex: 1 }}
                  />
                  <Button variant="outlined" onClick={addDay} startIcon={<AddIcon />} sx={{ minHeight: 56, ...FOCUS_RING, textTransform: 'none' }}>
                    Add
                  </Button>
                </Box>
                {fieldError('join_reminder_days') && <FormHelperText error>{fieldError('join_reminder_days')}</FormHelperText>}
              </Box>

              <Box>
                <FormControlLabel
                  control={
                    <Switch
                      checked={form.suggest_graduation}
                      onChange={(e) => update({ suggest_graduation: e.target.checked })}
                      // The shared theme paints the checked thumb the same blue as the
                      // track, which hides it; keep the thumb white so on and off read.
                      sx={{ flexShrink: 0, mr: 1.5, '& .MuiSwitch-switchBase.Mui-checked': { color: 'common.white' } }}
                    />
                  }
                  label="Suggest graduating students whose batch has ended"
                  sx={{ minHeight: 44, mr: 0 }}
                />
                <Typography variant="body2" color="text.secondary" sx={{ ml: { xs: 0, sm: 6 } }}>
                  When on, students still enrolled in an older batch than the current one are suggested for Graduate.
                </Typography>
              </Box>

              {savedNotice && !dirty && (
                <Alert
                  severity="success"
                  role="status"
                  action={
                    <Button
                      color="inherit"
                      onClick={runNow}
                      disabled={running}
                      startIcon={running ? <CircularProgress size={16} color="inherit" /> : <AutorenewIcon />}
                      sx={{ textTransform: 'none', ...TARGET_44 }}
                    >
                      {running ? 'Refreshing' : 'Refresh suggestions now'}
                    </Button>
                  }
                >
                  <AlertTitle>Rules saved</AlertTitle>
                  The next daily check uses them. Refresh now to see the effect straight away.
                </Alert>
              )}
              {runResult && (
                <Alert
                  severity={runResult.ok ? 'info' : 'error'}
                  action={
                    runResult.ok ? (
                      <Button component={Link} href="/lifecycle" color="inherit" sx={{ textTransform: 'none', ...TARGET_44 }}>
                        Open Lifecycle
                      </Button>
                    ) : undefined
                  }
                >
                  {runResult.text}
                </Alert>
              )}

              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
                <Button
                  type="button"
                  onClick={resetToDefaults}
                  disabled={saving || sameForm(form, defaults)}
                  startIcon={<RestartAltIcon />}
                  sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}
                >
                  Reset to defaults
                </Button>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  {dirty && (
                    <Typography variant="body2" color="text.secondary" role="status">
                      Unsaved changes
                    </Typography>
                  )}
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={saving || !dirty}
                    startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                    sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none', px: 3 }}
                  >
                    {saving ? 'Saving' : 'Save rules'}
                  </Button>
                </Box>
              </Box>
            </Box>
          )}
        </Paper>

        <Box sx={{ display: 'grid', gap: 2 }}>
          <Paper
            component={Link}
            href="/settings/notifications"
            variant="outlined"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              p: 2,
              borderRadius: 2,
              minHeight: 44,
              transition: 'border-color 150ms',
              '&:hover': { borderColor: 'primary.main' },
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              ...FOCUS_RING,
            }}
          >
            <NotificationsActiveOutlinedIcon color="primary" aria-hidden />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" fontWeight={700}>
                Notification recipients
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Who gets staff emails for new applications, payments and onboarding.
              </Typography>
            </Box>
            <KeyboardArrowRightIcon aria-hidden color="action" />
          </Paper>
          <Paper
            component={Link}
            href="/lifecycle"
            variant="outlined"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              p: 2,
              borderRadius: 2,
              minHeight: 44,
              transition: 'border-color 150ms',
              '&:hover': { borderColor: 'primary.main' },
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              ...FOCUS_RING,
            }}
          >
            <AutorenewIcon color="primary" aria-hidden />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" fontWeight={700}>
                Lifecycle suggestions
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Review what these rules suggest today.
              </Typography>
            </Box>
            <KeyboardArrowRightIcon aria-hidden color="action" />
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}
