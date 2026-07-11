'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Switch,
  Chip,
  Divider,
  CircularProgress,
  Alert,
  alpha,
  useTheme,
  Stack,
} from '@neram/ui';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import { useRouter } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import {
  FEATURES,
  FEATURE_FLAGS_KEY,
  type FeatureDef,
  type FeatureSurface,
  type FlagMap,
} from '@/lib/feature-flags';

/** Non-core features are the editable ones; core features are always on. */
const EDITABLE = FEATURES.filter((f) => !f.core);

/** Ordered surface sections with their sub-groups (registry order preserved). */
const SECTIONS: { surface: FeatureSurface; title: string; subtitle: string; groups: string[] }[] =
  (() => {
    const order: FeatureSurface[] = ['student', 'staff'];
    const meta: Record<FeatureSurface, { title: string; subtitle: string }> = {
      student: {
        title: 'Student features',
        subtitle: 'What enrolled students can see and open. Off by default until you switch each on.',
      },
      staff: {
        title: 'Teacher menus',
        subtitle: 'Teacher and management tools. On by default. Turn off anything not ready.',
      },
    };
    return order.map((surface) => {
      const groups: string[] = [];
      for (const f of FEATURES) {
        if (f.surface === surface && !f.core && !groups.includes(f.group)) groups.push(f.group);
      }
      return { surface, ...meta[surface], groups };
    });
  })();

export default function AdminFeaturesPage() {
  const { isAdmin, loading, getToken } = useNexusAuthContext();
  const router = useRouter();
  const theme = useTheme();

  const [flags, setFlags] = useState<FlagMap>({});
  const baselineRef = useRef<FlagMap>({});
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!loading && !isAdmin) router.replace('/teacher/dashboard');
  }, [isAdmin, loading, router]);

  // Load current overrides, merge with registry defaults for the editable set.
  useEffect(() => {
    async function fetchFlags() {
      let overrides: FlagMap = {};
      try {
        const res = await fetch(`/api/settings?key=${FEATURE_FLAGS_KEY}`);
        if (res.ok) {
          const data = await res.json();
          if (data.value && typeof data.value === 'object') overrides = data.value as FlagMap;
        }
      } catch {
        /* fall back to defaults */
      }
      const resolved: FlagMap = {};
      for (const f of EDITABLE) {
        resolved[f.id] = typeof overrides[f.id] === 'boolean' ? overrides[f.id] : f.defaultEnabled;
      }
      baselineRef.current = resolved;
      setFlags(resolved);
      setFetching(false);
    }
    fetchFlags();
  }, []);

  const dirty = useMemo(
    () => EDITABLE.some((f) => flags[f.id] !== baselineRef.current[f.id]),
    [flags],
  );

  const setOne = useCallback((id: string, value: boolean) => {
    setFlags((prev) => ({ ...prev, [id]: value }));
    setMessage(null);
  }, []);

  const setGroup = useCallback((surface: FeatureSurface, group: string, value: boolean) => {
    setFlags((prev) => {
      const next = { ...prev };
      for (const f of EDITABLE) {
        if (f.surface === surface && f.group === group) next[f.id] = value;
      }
      return next;
    });
    setMessage(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: FEATURE_FLAGS_KEY, value: flags }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save');
      }
      baselineRef.current = { ...flags };
      setMessage({ type: 'success', text: 'Saved. Students will see the change on their next load.' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  }, [flags, getToken]);

  if (loading || !isAdmin) return null;

  const enabledCount = EDITABLE.filter((f) => flags[f.id]).length;

  return (
    <Box sx={{ pb: 12 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        Features
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Turn features on one by one as they are tested. Off features are hidden from the menu and
        blocked if opened directly. {!fetching && `${enabledCount} of ${EDITABLE.length} on.`}
      </Typography>

      {fetching ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <Stack spacing={3}>
          {SECTIONS.map((section) => (
            <Paper
              key={section.surface}
              elevation={0}
              sx={{ borderRadius: 3, border: `1px solid ${theme.palette.divider}`, overflow: 'hidden' }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  p: { xs: 2, sm: 2.5 },
                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                }}
              >
                {section.surface === 'student' ? (
                  <SchoolOutlinedIcon color="primary" />
                ) : (
                  <GroupsOutlinedIcon color="primary" />
                )}
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {section.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {section.subtitle}
                  </Typography>
                </Box>
              </Box>
              <Divider />

              {section.groups.map((group, gi) => {
                const items = EDITABLE.filter(
                  (f) => f.surface === section.surface && f.group === group,
                );
                const allOn = items.every((f) => flags[f.id]);
                return (
                  <Box key={group}>
                    {gi > 0 && <Divider />}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        px: { xs: 2, sm: 2.5 },
                        pt: 2,
                        pb: 1,
                      }}
                    >
                      <Typography
                        variant="overline"
                        sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: 0.6 }}
                      >
                        {group}
                      </Typography>
                      <Button
                        size="small"
                        onClick={() => setGroup(section.surface, group, !allOn)}
                        sx={{ textTransform: 'none', fontWeight: 600, minWidth: 0 }}
                      >
                        {allOn ? 'Turn all off' : 'Turn all on'}
                      </Button>
                    </Box>
                    {items.map((f) => (
                      <FeatureRow
                        key={f.id}
                        feature={f}
                        checked={!!flags[f.id]}
                        onChange={(v) => setOne(f.id, v)}
                      />
                    ))}
                  </Box>
                );
              })}
            </Paper>
          ))}

          {/* Core (always-on) note */}
          <Paper
            elevation={0}
            sx={{
              borderRadius: 3,
              border: `1px dashed ${theme.palette.divider}`,
              p: { xs: 2, sm: 2.5 },
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
              <LockOutlinedIcon fontSize="small" color="disabled" />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Always on
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {FEATURES.filter((f) => f.core)
                .map((f) => f.label)
                .join(', ')}{' '}
              stay on so students always have a home and you never lose the admin controls.
            </Typography>
          </Paper>
        </Stack>
      )}

      {/* Sticky save bar */}
      {!fetching && (
        <Paper
          elevation={3}
          sx={{
            position: 'sticky',
            bottom: { xs: 72, md: 16 },
            mt: 3,
            p: 1.5,
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          {message ? (
            <Alert severity={message.type} sx={{ flex: 1, py: 0, borderRadius: 2 }}>
              {message.text}
            </Alert>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1, pl: 1 }}>
              {dirty ? 'You have unsaved changes.' : 'All changes saved.'}
            </Typography>
          )}
          <Button
            variant="contained"
            disabled={saving || !dirty}
            onClick={handleSave}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveOutlinedIcon />}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, minHeight: 44, px: 3 }}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </Paper>
      )}
    </Box>
  );
}

function FeatureRow({
  feature,
  checked,
  onChange,
}: {
  feature: FeatureDef;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: { xs: 2, sm: 2.5 },
        py: 1,
        gap: 2,
        minHeight: 48,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {feature.label}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {feature.paths[0]}
        </Typography>
      </Box>
      <Stack direction="row" spacing={1} alignItems="center">
        <Chip
          size="small"
          label={checked ? 'On' : 'Off'}
          color={checked ? 'success' : 'default'}
          variant={checked ? 'filled' : 'outlined'}
          sx={{ fontWeight: 600, minWidth: 46 }}
        />
        <Switch
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          inputProps={{ 'aria-label': `Toggle ${feature.label}` }}
        />
      </Stack>
    </Box>
  );
}
