'use client';

/**
 * Shared primitives for the Curriculum repository + Teaching Plans (Course Plan v2) UI:
 * priority/status/delivery badges, option lists, and the API DTO shapes the pages consume.
 */
import { useCallback } from 'react';
import { Chip, Box } from '@neram/ui';
import StarIcon from '@mui/icons-material/Star';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type {
  NexusCourseModule,
  NexusCourseTopic,
  NexusTopicPriority,
  NexusCourseTopicStatus,
  NexusTopicDelivery,
} from '@neram/database';

export type RepoTopic = NexusCourseTopic & { used_in_plans: number };
export type RepoModule = NexusCourseModule & { topics: RepoTopic[] };

export const PRIORITY_OPTIONS: { value: NexusTopicPriority; label: string }[] = [
  { value: 'mandatory', label: 'Mandatory' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];
export const DELIVERY_OPTIONS: { value: NexusTopicDelivery; label: string }[] = [
  { value: 'live', label: 'Live class' },
  { value: 'self_learning', label: 'Self-learning' },
  { value: 'either', label: 'Either' },
];
export const STATUS_META: Record<NexusCourseTopicStatus, { label: string; color: string; bg: string }> = {
  idea: { label: 'Idea', color: '#5A6672', bg: 'rgba(139,149,161,0.15)' },
  drafted: { label: 'Drafted', color: '#8D5A00', bg: 'rgba(249,168,37,0.18)' },
  class_ready: { label: 'Class ready', color: '#1B5E20', bg: 'rgba(46,125,50,0.12)' },
};
/** Fallback accent colors assigned to modules that have none set. */
export const MODULE_COLORS = ['#7C3AED', '#00897B', '#EF6C00', '#1565C0', '#C2185B', '#5D4037'];
export function moduleColor(module: Pick<NexusCourseModule, 'color'> | null, index = 0): string {
  return module?.color || MODULE_COLORS[index % MODULE_COLORS.length];
}

export function PriorityBadge({ priority }: { priority: NexusTopicPriority }) {
  if (priority === 'mandatory') {
    return (
      <Chip
        label="Mandatory"
        size="small"
        sx={{ bgcolor: 'primary.main', color: '#fff', fontWeight: 600, height: 20, fontSize: '0.68rem' }}
      />
    );
  }
  const filled = priority === 'high' ? 3 : priority === 'medium' ? 2 : 1;
  return (
    <Box
      component="span"
      title={`${priority} priority`}
      sx={{ display: 'inline-flex', alignItems: 'center' }}
      aria-label={`${priority} priority`}
    >
      {[0, 1, 2].map((i) => (
        <StarIcon
          key={i}
          sx={{ fontSize: 14, color: i < filled ? '#F9A825' : 'action.disabled' }}
        />
      ))}
    </Box>
  );
}

export function TopicStatusChip({ status }: { status: NexusCourseTopicStatus }) {
  const meta = STATUS_META[status];
  return (
    <Chip
      label={meta.label}
      size="small"
      sx={{ bgcolor: meta.bg, color: meta.color, fontWeight: 600, height: 20, fontSize: '0.68rem' }}
    />
  );
}

export function DeliveryIcon({ delivery }: { delivery: NexusTopicDelivery }) {
  if (delivery === 'self_learning') {
    return <MenuBookOutlinedIcon sx={{ fontSize: 16, color: '#00897B' }} titleAccess="Self-learning" />;
  }
  if (delivery === 'either') {
    return <SwapHorizOutlinedIcon sx={{ fontSize: 16, color: 'text.disabled' }} titleAccess="Live or self-learning" />;
  }
  return <VideocamOutlinedIcon sx={{ fontSize: 16, color: 'primary.main' }} titleAccess="Live class" />;
}

/**
 * Bearer-token fetch bound to the Nexus auth context.
 *
 * On a 401 the Microsoft session is stale (silent token acquisition can hand
 * back a cached token that Graph later rejects), so we kick off an interactive
 * re-auth to refresh it instead of leaving the caller stuck on a generic error.
 * Guarded so a genuinely broken session cannot spin in a redirect loop.
 */
let lastReauthAt = 0;

export function useAuthFetch() {
  const { getToken, signIn } = useNexusAuthContext();
  return useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getToken();
      if (!token) {
        // No token means the Microsoft session is gone (silent renewal failed
        // and the auto-redirect was suppressed or has not landed yet). Treat it
        // like a 401 so the UI offers re-sign-in instead of a dead generic error.
        if (Date.now() - lastReauthAt > 60_000) {
          lastReauthAt = Date.now();
          void signIn();
        }
        throw new Error('Your session expired. Please sign in again.');
      }
      const res = await fetch(url, {
        ...init,
        headers: {
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init?.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await res.json().catch(() => ({}));
      if (res.status === 401) {
        // Refresh the expired session at most once a minute (avoids a loop if
        // re-auth keeps returning a token the server rejects).
        if (Date.now() - lastReauthAt > 60_000) {
          lastReauthAt = Date.now();
          void signIn();
        }
        throw new Error('Your session expired. Please sign in again.');
      }
      if (!res.ok) throw new Error(payload.error || 'Request failed');
      return payload;
    },
    [getToken, signIn],
  );
}
