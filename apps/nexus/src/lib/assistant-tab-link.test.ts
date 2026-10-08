import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_TAB_ENTITY_ID,
  ASSISTANT_TEAMS_APP_ID,
  assistantNotificationTarget,
  notificationIdFromContext,
} from './assistant-tab-link';

const manifest = JSON.parse(readFileSync(path.resolve(__dirname, '../../teams-app/manifest.json'), 'utf-8'));

describe('assistant tab deep link', () => {
  it('names the app and the tab the manifest actually ships', () => {
    expect(ASSISTANT_TEAMS_APP_ID).toBe(manifest.id);
    expect(manifest.staticTabs.map((t: any) => t.entityId)).toContain(ASSISTANT_TAB_ENTITY_ID);
  });

  it('carries the notification id, preferring the configured app id', () => {
    expect(assistantNotificationTarget('n1', {})).toEqual({
      appId: ASSISTANT_TEAMS_APP_ID,
      entityId: ASSISTANT_TAB_ENTITY_ID,
      subEntityId: 'n1',
    });
    expect(assistantNotificationTarget('n1', { PAD_TEAMS_APP_ID: ' other\n' }).appId).toBe('other');
  });

  it('reads the id back from the tab context', () => {
    expect(notificationIdFromContext({ page: { subPageId: 'n1' } })).toBe('n1');
    expect(notificationIdFromContext({ page: { subPageId: ' ' } })).toBeNull();
    expect(notificationIdFromContext({ page: {} })).toBeNull();
    expect(notificationIdFromContext(null)).toBeNull();
  });
});
