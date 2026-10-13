'use client';

/**
 * A "watch before class" video, played inside Nexus.
 *
 * The one playback surface for these videos: the class panel, the Teams post
 * and the share message all link here. Back returns to the class it belongs to
 * on the timetable. The rest of the class's videos sit underneath as "Up next",
 * each with the student's own tick.
 *
 * The flag is checked here rather than through the registry's `paths`: a path
 * under /student/timetable/ would, by longest-prefix matching, also switch off
 * catch-up and exams.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Box, Button, Skeleton, Typography } from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import PrewatchPlayer from '@/components/timetable/prewatch/PrewatchPlayer';
import PrewatchVideoRow, { PrewatchStateBadge } from '@/components/timetable/prewatch/PrewatchVideoRow';
import { PREWATCH_FEATURE } from '@/lib/feature-flags';
import { formatDuration, type PrewatchItem } from '@/lib/prewatch';

export default function PrewatchWatchPage() {
  const params = useParams<{ classId: string; resourceId: string }>();
  const classId = params.classId;
  const resourceId = params.resourceId;
  const router = useRouter();
  const { getToken, tokenReady, isFeatureEnabled, loading: authLoading } = useNexusAuthContext();
  const enabled = isFeatureEnabled(PREWATCH_FEATURE);
  const [items, setItems] = useState<PrewatchItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const backHref = `/student/timetable?class=${encodeURIComponent(classId)}`;

  const loadList = useCallback(async () => {
    try {
      const token = await getTokenRef.current();
      if (!token) return;
      const res = await fetch(`/api/timetable/${classId}/prewatch`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      setFailed(true);
    }
  }, [classId]);

  useEffect(() => {
    if (!tokenReady || !enabled) return;
    void loadList();
  }, [tokenReady, enabled, loadList]);

  const current = items?.find((i) => i.id === resourceId) ?? null;
  const others = (items || []).filter((i) => i.id !== resourceId);

  const back = (
    <Button
      startIcon={<ArrowBackIcon />}
      onClick={() => router.push(backHref)}
      sx={{ textTransform: 'none', minHeight: 44, ml: -1, mb: 1 }}
    >
      Back to the class
    </Button>
  );

  if (!authLoading && !enabled) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 720, mx: 'auto' }}>
        {back}
        <Typography variant="body1">These videos are not available right now.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 820, mx: 'auto', pb: 10 }}>
      {back}

      <Typography
        sx={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'primary.main' }}
      >
        Watch before class
      </Typography>

      {items === null && !failed ? (
        <Skeleton variant="text" sx={{ fontSize: '1.5rem', mb: 1.5 }} width="70%" />
      ) : current ? (
        <Box sx={{ mb: 1.5 }}>
          <Typography component="h1" variant="h5" sx={{ fontWeight: 800, lineHeight: 1.25, overflowWrap: 'anywhere' }}>
            {current.title}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              {[current.source_label, formatDuration(current.duration_seconds)].filter(Boolean).join(' · ')}
            </Typography>
            <PrewatchStateBadge state={current.state} />
          </Box>
        </Box>
      ) : (
        <Typography variant="body1" sx={{ mb: 1.5 }}>
          {failed ? 'Could not load this class’s videos.' : 'This video is no longer on the class.'}
        </Typography>
      )}

      {/* Mounted as soon as the page knows who you are: the play route makes its
          own decision, so the list does not have to load first. */}
      {enabled && tokenReady && (items === null || current) && (
        <Box sx={{ mx: { xs: -2, sm: 0 } }}>
          <PrewatchPlayer classId={classId} resourceId={resourceId} getToken={getToken} trackProgress />
        </Box>
      )}

      {current?.note && (
        <Typography variant="body1" sx={{ mt: 1.5, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
          {current.note}
        </Typography>
      )}

      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
        Optional. Your place is saved, and it counts as watched once most of it has played.
      </Typography>

      {others.length > 0 && (
        <Box component="section" aria-labelledby="prewatch-up-next" sx={{ mt: 3 }}>
          <Typography id="prewatch-up-next" component="h2" variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            Also for this class
          </Typography>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {others.map((item) => (
              <Box component="li" key={item.id}>
                <PrewatchVideoRow
                  video={{ ...item, subtitle: item.source_label }}
                  onOpen={() => router.replace(`/student/timetable/${classId}/watch/${item.id}`)}
                  openLabel={`Play ${item.title}`}
                  trailing={<PrewatchStateBadge state={item.state} />}
                />
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
