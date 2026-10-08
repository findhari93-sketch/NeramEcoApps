/**
 * Where a Teams Activity click from Neram Assistant lands: the Assistant's own
 * tab, opened on the one notification that was clicked.
 *
 * The tab cannot show the Nexus page itself (Nexus refuses to be framed, and its
 * Microsoft sign-in refuses too), so it shows the notification in full with an
 * "Open in Nexus" button. The notification id travels as the deep link's
 * subEntityId and arrives in the tab as `context.page.subPageId`.
 *
 * PURE and client safe.
 */
import type { TeamsActivityTarget } from '@neram/auth';

/** manifest.json `id`. The same Teams app the Answer Pad uses (PAD_TEAMS_APP_ID). */
export const ASSISTANT_TEAMS_APP_ID = 'df4f6b2d-ea18-46d1-8934-f508ac248e6c';

/** manifest.json staticTabs[0].entityId, the Assistant's Home tab. */
export const ASSISTANT_TAB_ENTITY_ID = 'nexusAssignments';

export function assistantNotificationTarget(
  notificationId: string,
  env: Record<string, string | undefined> = process.env,
): TeamsActivityTarget {
  return {
    appId: env.PAD_TEAMS_APP_ID?.trim() || ASSISTANT_TEAMS_APP_ID,
    entityId: ASSISTANT_TAB_ENTITY_ID,
    subEntityId: notificationId,
  };
}

/** The notification id a tab was opened on, or null when it was opened directly. */
export function notificationIdFromContext(context: {
  page?: { subPageId?: string };
} | null | undefined): string | null {
  const id = context?.page?.subPageId?.trim();
  return id ? id : null;
}
