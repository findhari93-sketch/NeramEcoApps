'use client';

/**
 * Everything your teachers have shared, in one place.
 *
 * The per-class views answer "what should I look at for this class". This page
 * answers the question a student actually asks a week later: "where was that
 * video sir showed us". Grouped by class, newest first, with a search across
 * every title and note.
 *
 * Previously this route listed classroom-scoped nexus_resources and was not in
 * the nav, so nothing reached it. It now reads class reference material; the old
 * table and /api/resources are untouched.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  InputAdornment,
  Skeleton,
  TextField,
  Typography,
  useTheme,
} from '@neram/ui';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ResourceCard from '@/components/timetable/ResourceCard';
import ResourceOpener, { openExternalResource } from '@/components/timetable/ResourceOpener';
import { RADIUS } from '@/components/timetable/timetable-theme';
import type { ClassResource } from '@/lib/class-resources';

interface ResourceGroup {
  class_id: string;
  class_title: string;
  scheduled_date: string;
  resources: ClassResource[];
}

function formatDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function StudentResourcesPage() {
  const theme = useTheme();
  const { getToken } = useNexusAuthContext();
  const [groups, setGroups] = useState<ResourceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [opened, setOpened] = useState<ClassResource | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/student/resources', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups || []);
      }
    } catch {
      /* the empty state covers this */
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  // Client-side, because the whole set is already here and a student typing
  // should not wait on a round trip. The note is searched too: "the one where he
  // explained the vanishing point" is how people actually remember these.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        resources: g.resources.filter(
          (r) =>
            r.title.toLowerCase().includes(q) ||
            (r.note || '').toLowerCase().includes(q) ||
            g.class_title.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.resources.length > 0);
  }, [groups, search]);

  const openResource = (resource: ClassResource) => {
    if (openExternalResource(resource)) return;
    setOpened(resource);
  };

  const total = groups.reduce((n, g) => n + g.resources.length, 0);

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 720, mx: 'auto' }}>
      <Typography variant="h5" sx={{ fontSize: { xs: '1.2rem', sm: '1.5rem' }, mb: 0.5 }}>
        Reference material
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Extra help your teachers picked out, kept with the class it belongs to.
      </Typography>

      {!loading && total > 0 && (
        <TextField
          fullWidth
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title, note or class"
          inputProps={{ 'aria-label': 'Search reference material' }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlinedIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 2.5, '& .MuiInputBase-root': { minHeight: 48, borderRadius: RADIUS.control } }}
        />
      )}

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Skeleton variant="rounded" height={72} />
          <Skeleton variant="rounded" height={72} />
          <Skeleton variant="rounded" height={72} />
        </Box>
      ) : visible.length > 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {visible.map((group) => (
            <Box key={group.class_id}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', lineHeight: 1.3 }}>
                {group.class_title}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                {formatDay(group.scheduled_date)}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {group.resources.map((resource) => (
                  <ResourceCard key={resource.id} resource={resource} onOpen={openResource} />
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      ) : (
        <Box
          sx={{
            border: `1px dashed ${theme.palette.divider}`,
            borderRadius: RADIUS.card,
            p: 4,
            textAlign: 'center',
          }}
        >
          <MenuBookOutlinedIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            {search
              ? 'Nothing matches that.'
              : 'Nothing shared yet. When a teacher adds material to a class, it shows up here.'}
          </Typography>
        </Box>
      )}

      <ResourceOpener resource={opened} onClose={() => setOpened(null)} getToken={getToken} />
    </Box>
  );
}
