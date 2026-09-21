'use client';

import { useRouter } from 'next/navigation';
import { Box, Tab, Tabs } from '@neram/ui';
import PageHeader from '@/components/PageHeader';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { hubHref, visibleHubTabs, type HubRole, type HubTabKey } from '@/lib/drawings-hub';

interface DrawingsHubShellProps {
  role: HubRole;
  /** Which tab the current URL is showing. */
  active: HubTabKey;
  title?: string;
  subtitle?: string;
  backHref?: string;
  /** The header's own button, e.g. Inspiration's Saved or Add exemplar. */
  action?: React.ReactNode;
  /** A count to show beside a tab label, e.g. sketches not yet flipped through. */
  countFor?: (key: HubTabKey) => number | undefined;
  /**
   * Called for an in-page tab when THIS page owns the tab's content. A page
   * showing a tab that has its own route (Inspiration) does not, so the bar
   * navigates to the hub instead and never calls this.
   */
  onSelect?: (key: HubTabKey) => void;
  children: React.ReactNode;
}

/**
 * The Drawings hub's chrome: one header, one tab bar, whatever the tab renders.
 *
 * A component rather than a layout.tsx, because the tabs span two route trees.
 * Inspiration keeps its own routes (see lib/drawings-hub), and a layout under
 * teacher/sketchbook could never draw the bar for teacher/inspiration, nor
 * could it stay off the per-student pages nested below it, which must not show
 * tabs at all.
 *
 * In-page tabs are deliberately NOT links. A soft navigation to the same
 * pathname with a different ?view= would not re-run the mount effect that reads
 * the query, and useSearchParams is what bailed 104 routes out of prerendering,
 * which is why lib/list-url-state exists at all. So: the page owns the state,
 * this bar reports the tap, and only a tab that owns a real route navigates.
 */
export default function DrawingsHubShell({
  role,
  active,
  title = 'Drawings',
  subtitle,
  backHref,
  action,
  countFor,
  onSelect,
  children,
}: DrawingsHubShellProps) {
  const router = useRouter();
  const { featureFlags } = useNexusAuthContext();
  const tabs = visibleHubTabs(role, featureFlags);

  // A flag can hide the tab the URL is on (Inspiration switched off while a
  // teacher sits on it). Falling back to the first tab keeps MUI from warning
  // about a value with no Tab, and the route guard shows the real message.
  const value = tabs.some((t) => t.key === active) ? active : tabs[0]?.key;
  // Inspiration renders on its own route, so a page showing it cannot also
  // render Flip through or Class rhythm. Tapping one there has to navigate; the
  // tab would otherwise light up and nothing at all would happen.
  const ownsInPageTabs = !tabs.find((t) => t.key === value)?.href;

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader title={title} subtitle={subtitle} backHref={backHref} action={action} />
      {tabs.length > 1 && (
        <Tabs
          value={value}
          onChange={(_, next: HubTabKey) => {
            const tab = tabs.find((t) => t.key === next);
            if (tab?.href || !ownsInPageTabs) router.push(hubHref(role, next));
            else onSelect?.(next);
          }}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          aria-label="Drawings"
          sx={{ mb: 2, minHeight: 48 }}
        >
          {tabs.map((t) => {
            const count = countFor?.(t.key);
            return (
              <Tab
                key={t.key}
                value={t.key}
                label={count ? `${t.label} (${count})` : t.label}
                sx={{ minHeight: 48 }}
              />
            );
          })}
        </Tabs>
      )}
      {children}
    </Box>
  );
}
