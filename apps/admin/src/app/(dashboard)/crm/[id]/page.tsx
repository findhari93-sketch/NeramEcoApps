'use client';

/**
 * User 360 (lifecycle plan M4): one person, every app, one screen.
 *
 * Sticky header (who, lifecycle stage, engagement, last active, duplicates,
 * suggestions) above eight tabs. Each tab is its own code chunk and mounts only
 * when opened, so sections that fetch (timeline, owners, auto messages,
 * diagnostics) load lazily. Tab state lives in ?tab= so reload and Back keep
 * it; ?from= remembers which list to go back to; legacy ?section= links from
 * the notification bell open the right tab and scroll to the section.
 */

import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Box, Button, Paper, Skeleton, Tab, Tabs } from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import type { User360, UserJourneyDetail } from '@neram/database';
import { useAdminProfile } from '@/contexts/AdminProfileContext';
import EditUserDialog from '@/components/crm/EditUserDialog';
import User360Header from '@/components/user360/User360Header';
import { TabSkeleton, a11yRootSx, type User360TabProps } from '@/components/user360/shared';
import {
  USER360_TABS,
  USER360_TAB_LABELS,
  buildTabQuery,
  normalizePerson,
  resolveBackTarget,
  resolveUser360Tab,
  type User360Tab,
} from '@/lib/user360-view';

const loading = () => <TabSkeleton />;

const TAB_COMPONENTS: Record<User360Tab, ComponentType<User360TabProps>> = {
  overview: dynamic(() => import('@/components/user360/tabs/OverviewTab'), { loading }),
  activity: dynamic(() => import('@/components/user360/tabs/ActivityTab'), { loading }),
  journey: dynamic(() => import('@/components/user360/tabs/JourneyTab'), { loading }),
  enrollment: dynamic(() => import('@/components/user360/tabs/EnrollmentTab'), { loading }),
  access: dynamic(() => import('@/components/user360/tabs/AccessTab'), { loading }),
  crm: dynamic(() => import('@/components/user360/tabs/CrmTab'), { loading }),
  feedback: dynamic(() => import('@/components/user360/tabs/FeedbackTab'), { loading }),
  audit: dynamic(() => import('@/components/user360/tabs/AuditTab'), { loading }),
};

function tabCount(tab: User360Tab, data: User360 | null): number | null {
  if (!data) return null;
  if (tab === 'crm') return data.crm?.openFollowUps?.length || null;
  if (tab === 'feedback') {
    const n = (data.feedback?.appFeedback?.length || 0) + (data.feedback?.testimonials?.length || 0) + (data.outcomes?.length || 0);
    return n || null;
  }
  if (tab === 'enrollment') return data.enrollments?.length || null;
  return null;
}

function PageSkeleton() {
  return (
    <Box aria-busy="true" aria-label="Loading person">
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'grey.200', borderRadius: 1, p: 2, mb: 2 }}>
        <Skeleton width={120} height={32} />
        <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
          <Skeleton variant="circular" width={56} height={56} />
          <Box sx={{ flex: 1 }}>
            <Skeleton width="40%" height={36} />
            <Skeleton width="60%" />
            <Skeleton width="50%" />
          </Box>
        </Box>
        <Skeleton height={48} sx={{ mt: 1 }} />
      </Paper>
      <TabSkeleton />
    </Box>
  );
}

export default function UserDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { supabaseUserId, supabaseName } = useAdminProfile();
  const adminId = supabaseUserId || 'unknown';
  const adminName = supabaseName || 'Admin';

  const tab = resolveUser360Tab(searchParams.get('tab'), searchParams.get('section'));
  const from = searchParams.get('from');
  const back = resolveBackTarget(from);

  const [data, setData] = useState<User360 | null>(null);
  const [detail, setDetail] = useState<UserJourneyDetail | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const focusNonce = useRef(0);

  /** Both payloads in parallel. After the first load a refresh keeps the screen as it is. */
  const load = useCallback(
    async (initial: boolean) => {
      if (initial) {
        setInitialLoading(true);
        setError('');
        setNotFound(false);
      }
      try {
        const [r360, rDetail] = await Promise.all([
          fetch(`/api/users/${params.id}/360`),
          fetch(`/api/crm/users/${params.id}`),
        ]);
        if (r360.status === 404 && rDetail.status === 404) {
          setNotFound(true);
          return;
        }
        if (!r360.ok) {
          const json = await r360.json().catch(() => ({}));
          throw new Error(json.error || 'Could not load this person.');
        }
        const [json360, jsonDetail] = await Promise.all([
          r360.json(),
          rDetail.ok ? rDetail.json() : Promise.resolve(null),
        ]);
        setData({ ...json360, person: normalizePerson(json360.person, jsonDetail?.user, params.id) });
        setDetail(jsonDetail);
        setRefreshError('');
      } catch (e: any) {
        if (initial) setError(e.message || 'Could not load this person.');
        else setRefreshError(e.message || 'Could not refresh. What you see may be out of date.');
      } finally {
        if (initial) setInitialLoading(false);
      }
    },
    [params.id],
  );

  useEffect(() => {
    load(true);
  }, [load]);

  const refresh = useCallback(() => {
    load(false);
  }, [load]);

  const goToTab = useCallback(
    (next: string) => {
      const t = resolveUser360Tab(next);
      router.replace(`/crm/${params.id}${buildTabQuery(t, from)}`, { scroll: false });
    },
    [router, params.id, from],
  );

  const focusOnCrm = (target: 'owner' | 'notes') => {
    focusNonce.current += 1;
    setFocus(`${target}:${focusNonce.current}`);
    if (tab !== 'crm') goToTab('crm');
  };

  // Legacy notification links: /crm/[id]?section=callbacks opens the tab, then scrolls to the section.
  const section = searchParams.get('section');
  useEffect(() => {
    if (!section || !data) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const find = () => {
      const el = document.getElementById(`crm-section-${section}`);
      if (el) {
        el.scrollIntoView({ block: 'start' });
        el.style.boxShadow = '0 0 0 3px rgba(25,118,210,0.45)';
        el.style.borderRadius = '8px';
        timer = setTimeout(() => {
          el.style.boxShadow = '';
        }, 2500);
      } else if (tries++ < 40) {
        timer = setTimeout(find, 100);
      }
    };
    find();
    return () => clearTimeout(timer);
  }, [section, data]);

  if (initialLoading) return <PageSkeleton />;

  if (notFound || error || !data) {
    return (
      <Box sx={{ ...a11yRootSx }}>
        <Button component={Link} href={back.href} startIcon={<ArrowBackIcon />} sx={{ textTransform: 'none', minHeight: 44, mb: 2 }}>
          {back.label}
        </Button>
        <Alert
          severity="error"
          role="alert"
          action={
            notFound ? undefined : (
              <Button color="inherit" onClick={() => load(true)} sx={{ minHeight: 44 }}>
                Try again
              </Button>
            )
          }
        >
          {notFound ? 'No person with this id. They may have been merged into another record or deleted.' : error || 'Could not load this person.'}
        </Alert>
      </Box>
    );
  }

  const TabComponent = TAB_COMPONENTS[tab];
  const tabProps: User360TabProps = {
    userId: params.id,
    data,
    detail,
    adminId,
    adminName,
    onRefresh: refresh,
    onNavigateTab: goToTab,
    focus: tab === 'crm' ? focus : null,
  };

  return (
    <Box sx={{ ...a11yRootSx, minWidth: 0 }}>
      <Box
        sx={{
          position: { xs: 'static', md: 'sticky' },
          top: 0,
          zIndex: 5,
          bgcolor: 'background.default',
          mx: { md: -3 },
          px: { md: 3 },
          mt: { md: -3 },
          pt: { md: 3 },
          pb: 1,
          mb: 1,
        }}
      >
        <User360Header
          data={data}
          backHref={back.href}
          backLabel={back.label}
          onEdit={() => setEditOpen(true)}
          onAssign={() => focusOnCrm('owner')}
          onAddNote={() => focusOnCrm('notes')}
          editDisabled={!detail}
        />
        <Tabs
          value={tab}
          onChange={(_e, v) => goToTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          aria-label="Sections for this person"
          sx={{
            mt: 1,
            minHeight: 48,
            borderBottom: '1px solid',
            borderColor: 'grey.200',
            '& .MuiTab-root': { minHeight: 48, textTransform: 'none', fontWeight: 600, fontSize: 14, px: 2 },
          }}
        >
          {USER360_TABS.map((t) => {
            const n = tabCount(t, data);
            return (
              <Tab
                key={t}
                value={t}
                id={`u360-tab-${t}`}
                aria-controls="u360-panel"
                label={n ? `${USER360_TAB_LABELS[t]} (${n})` : USER360_TAB_LABELS[t]}
              />
            );
          })}
        </Tabs>
      </Box>

      {refreshError && (
        <Alert severity="warning" role="alert" sx={{ mb: 2 }} onClose={() => setRefreshError('')}>
          {refreshError}
        </Alert>
      )}
      {!detail && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Some older sections (application, payments, notes) could not be loaded for this person. The rest of the page is
          current.
        </Alert>
      )}

      <Box id="u360-panel" role="tabpanel" aria-labelledby={`u360-tab-${tab}`} sx={{ minWidth: 0 }}>
        <TabComponent key={tab} {...tabProps} />
      </Box>

      {detail && (
        <EditUserDialog open={editOpen} onClose={() => setEditOpen(false)} detail={detail} adminId={adminId} onSaved={refresh} />
      )}
    </Box>
  );
}
