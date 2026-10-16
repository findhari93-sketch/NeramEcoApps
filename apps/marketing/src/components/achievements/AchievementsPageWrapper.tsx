'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import { Box } from '@neram/ui';
import LeaderboardOutlinedIcon from '@mui/icons-material/LeaderboardOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import { PageHero, tokens as t, type StatItem } from '@/design-system';
import ResultsWall from './ResultsWall';
import AchievementsPageContent from '../AchievementsPageContent';

interface AchievementsPageWrapperProps {
  locale: string;
}

interface StatsData {
  total: number;
  avg_nata_score: number | null;
  top_rank: number | null;
  colleges_count: number;
}

const TABS = [
  { id: 'results', label: 'Student Results', icon: <LeaderboardOutlinedIcon aria-hidden /> },
  { id: 'achievements', label: 'Achievements', icon: <WorkspacePremiumOutlinedIcon aria-hidden /> },
] as const;

/** Real counts from /api/student-results?stats=true; null while loading (skeletons), omitted when absent. */
function useResultStats(): StatItem[] | undefined {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchStats() {
      try {
        const res = await fetch('/api/student-results?stats=true');
        const json = await res.json();
        if (cancelled) return;
        if (json.success && json.data) setStats(json.data);
        else setFailed(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    fetchStats();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return undefined;
  if (!stats) {
    return [
      { value: null, label: 'Total Students' },
      { value: null, label: 'Avg NATA Score' },
      { value: null, label: 'Top Rank' },
      { value: null, label: 'Colleges' },
    ];
  }
  const items: StatItem[] = [];
  if (stats.total > 0) items.push({ value: stats.total.toLocaleString('en-IN'), label: 'Total Students' });
  if (stats.avg_nata_score != null) items.push({ value: Math.round(stats.avg_nata_score), label: 'Avg NATA Score' });
  if (stats.top_rank != null) items.push({ value: stats.top_rank, label: 'Top Rank' });
  if (stats.colleges_count > 0) items.push({ value: stats.colleges_count, label: 'Colleges' });
  return items.length > 0 ? items : undefined;
}

/**
 * T8 achievements page: dark hero with live result counts, then two tabs that
 * sit flush with the hero's bottom edge (results wall, academic-year achievements).
 */
export default function AchievementsPageWrapper({ locale }: AchievementsPageWrapperProps) {
  const [activeTab, setActiveTab] = useState(0);
  const stats = useResultStats();

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (activeTab + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    setActiveTab(next);
    document.getElementById(`achievements-tab-${TABS[next].id}`)?.focus();
  }

  const tabs = (
    <Box sx={{ borderTop: `1px solid ${t.lineDark}` }}>
      <Box
        role="tablist"
        aria-label="Results and achievements"
        sx={{
          maxWidth: t.container.page,
          mx: 'auto',
          px: { xs: 2, sm: 3 },
          boxSizing: 'content-box',
          display: 'flex',
          gap: { xs: 1, sm: 3 },
        }}
      >
        {TABS.map((tab, i) => {
          const selected = activeTab === i;
          return (
            <Box
              key={tab.id}
              component="button"
              type="button"
              role="tab"
              id={`achievements-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`achievements-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTab(i)}
              onKeyDown={onTabKeyDown}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1,
                minHeight: 52,
                px: 0.5,
                border: 0,
                borderBottom: `2px solid ${selected ? t.gold500 : 'transparent'}`,
                bgcolor: 'transparent',
                color: selected ? t.paper : t.paperSubtle,
                font: 'inherit',
                fontSize: '0.9375rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'color 150ms ease, border-color 150ms ease',
                '& svg': { fontSize: 20, color: selected ? t.gold500 : 'inherit' },
                '&:hover': { color: t.paper },
                '&:focus-visible': { outline: t.focusOutline, outlineOffset: '-2px' },
              }}
            >
              {tab.icon}
              {tab.label}
            </Box>
          );
        })}
      </Box>
    </Box>
  );

  return (
    <>
      <PageHero
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'Achievements' }]}
        eyebrow="Student results"
        title="Our Achievers"
        lede="Congratulations to our students who excelled in NATA, JEE Paper 2, and TNEA exams"
        stats={stats}
        bottom={tabs}
      />
      <Box
        role="tabpanel"
        id={`achievements-panel-${TABS[activeTab].id}`}
        aria-labelledby={`achievements-tab-${TABS[activeTab].id}`}
        sx={{ bgcolor: t.ground }}
      >
        {activeTab === 0 ? <ResultsWall /> : <AchievementsPageContent locale={locale} />}
      </Box>
    </>
  );
}
