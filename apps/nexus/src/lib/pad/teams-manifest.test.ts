// @vitest-environment node
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { isTeamsPadPath } from './embedded';
import { answerPadTab, answerPopupUrl, consolePopOutUrl } from './teams-tab';

/**
 * The Teams app manifest, checked against the code it points at. A broken
 * package fails in the Teams admin center with little explanation, and a wrong
 * domain or resource only shows up as a blank panel in a live class, so those
 * mistakes are caught here instead.
 */

const NEXUS = path.resolve(__dirname, '../../..');
const manifest = JSON.parse(readFileSync(path.join(NEXUS, 'teams-app/manifest.json'), 'utf-8'));
const APP_ID = 'aa039c70-50d2-4c91-bd0e-5675df5e50ff';

describe('Teams app manifest', () => {
  it('is the existing Neram Assistant app, version 1.3.0, still carrying My Work', () => {
    expect(manifest.id).toBe('df4f6b2d-ea18-46d1-8934-f508ac248e6c');
    expect(manifest.version).toBe('1.3.0');
    expect(Number(manifest.manifestVersion)).toBeGreaterThanOrEqual(1.21);
    expect(manifest.$schema).toContain(`/v${manifest.manifestVersion}/`);
    expect(manifest.staticTabs).toEqual([
      expect.objectContaining({ entityId: 'nexusAssignments', contentUrl: 'https://nexus.neramclasses.com/student/assignments' }),
    ]);
  });

  // The admin center refused the 1.3.0 upload with one line: 'Property
  // "packageName" has not been defined and the schema does not allow additional
  // properties.' v1.16 defined packageName and v1.21 does not, so moving the
  // manifest up a version turned a valid key into a rejected package. The schema
  // is kept beside the manifest and read here, so the next such key is named
  // before anyone waits on an upload.
  it('declares no property the schema for its own manifestVersion refuses', () => {
    const schemaFile = path.join(NEXUS, `teams-app/MicrosoftTeams.schema.${manifest.manifestVersion}.json`);
    expect(existsSync(schemaFile)).toBe(true);
    const schema = JSON.parse(readFileSync(schemaFile, 'utf-8'));
    expect(schema.additionalProperties).toBe(false);
    const defined = new Set(Object.keys(schema.properties));
    expect(Object.keys(manifest).filter((key) => !defined.has(key))).toEqual([]);
  });

  it('adds the Answer Pad to meetings through a configuration page that exists and may be framed by Teams', () => {
    expect(manifest.configurableTabs).toEqual([
      {
        configurationUrl: 'https://nexus.neramclasses.com/pad/teams/config',
        canUpdateConfiguration: false,
        scopes: ['team', 'groupChat'],
        context: ['meetingSidePanel', 'meetingStage', 'meetingChatTab', 'meetingDetailsTab'],
      },
    ]);
    expect(existsSync(path.join(NEXUS, 'src/app/(pad)/pad/teams/config/page.tsx'))).toBe(true);
    expect(existsSync(path.join(NEXUS, 'src/app/(pad)/pad/teams/page.tsx'))).toBe(true);
    expect(isTeamsPadPath(new URL(manifest.configurableTabs[0].configurationUrl).pathname)).toBe(true);
  });

  // A student pressed Teams' own Share button in the first demo and the pad took
  // over the meeting screen. The flag hides that button for everyone; the teacher
  // keeps "Show results on the meeting screen" in the console's menu.
  it("hides Teams' own Share button, which every participant, students included, used to get", () => {
    expect(manifest.meetingExtensionDefinition).toEqual({ supportsCustomShareToStage: true });
  });

  it('saves the same tab address the side panel serves, from the one definition Graph also pins', () => {
    const config = readFileSync(path.join(NEXUS, 'src/app/(pad)/pad/teams/config/page.tsx'), 'utf-8');
    expect(config).toContain('answerPadTab(window.location.origin)');
    expect(answerPadTab('https://nexus.neramclasses.com/')).toEqual({
      entityId: 'answer-pad',
      contentUrl: 'https://nexus.neramclasses.com/pad/teams',
      websiteUrl: 'https://nexus.neramclasses.com/pad',
      displayName: 'Answer Pad',
    });
    expect(answerPopupUrl('https://nexus.neramclasses.com')).toBe('https://nexus.neramclasses.com/pad/teams/answer');
    expect(existsSync(path.join(NEXUS, 'src/app/(pad)/pad/teams/answer/page.tsx'))).toBe(true);
    expect(isTeamsPadPath('/pad/teams/answer')).toBe(true);
  });

  it('pops the console out to a page on the valid domain that signs in with Teams', () => {
    const url = new URL(consolePopOutUrl('https://nexus.neramclasses.com/', '11111111-1111-4111-8111-111111111111'));
    expect(url.href).toBe('https://nexus.neramclasses.com/pad/teams/console?session=11111111-1111-4111-8111-111111111111');
    expect(manifest.validDomains).toContain(url.host);
    expect(isTeamsPadPath(url.pathname)).toBe(true);
    expect(existsSync(path.join(NEXUS, 'src/app/(pad)/pad/teams/console/page.tsx'))).toBe(true);
  });

  it('keeps every page on a valid domain, and that domain is the one sign-in names', () => {
    const pages = [
      ...manifest.staticTabs.flatMap((tab: { contentUrl: string; websiteUrl: string }) => [tab.contentUrl, tab.websiteUrl]),
      ...manifest.configurableTabs.map((tab: { configurationUrl: string }) => tab.configurationUrl),
    ];
    for (const page of pages) {
      expect(new URL(page).protocol).toBe('https:');
      expect(manifest.validDomains).toContain(new URL(page).host);
    }
    expect(manifest.webApplicationInfo).toEqual({ id: APP_ID, resource: `api://nexus.neramclasses.com/${APP_ID}` });
  });

  it('uses the Nexus Entra app as the bot, with a messaging route to receive it', () => {
    expect(manifest.bots).toEqual([
      { botId: APP_ID, scopes: ['personal', 'team', 'groupChat'], supportsFiles: false, isNotificationOnly: false },
    ]);
    expect(existsSync(path.join(NEXUS, 'src/app/api/pad/bot/messages/route.ts'))).toBe(true);
  });

  // The scope Neram Assistant needs to send a 1:1 chat at all. Without it Graph
  // returns an install with no chat, and every system message quietly falls back
  // to the activity feed, which is the state this app was in before v1.2.0.
  it('lets the bot hold a 1:1 chat, which is how the system speaks without borrowing a teacher', () => {
    expect(manifest.bots[0].scopes).toContain('personal');
    // Not notification-only: a student who replies gets a sentence back saying
    // the Assistant cannot read it and naming what does work.
    expect(manifest.bots[0].isNotificationOnly).toBe(false);
  });

  it('asks only for the meeting permissions it uses: participants and notifications for the bot, and sharing results to the meeting screen', () => {
    expect(manifest.authorization.permissions.resourceSpecific).toEqual([
      { name: 'OnlineMeetingParticipant.Read.Chat', type: 'Application' },
      { name: 'OnlineMeetingNotification.Send.Chat', type: 'Application' },
      { name: 'ChannelMeetingParticipant.Read.Group', type: 'Application' },
      { name: 'ChannelMeetingNotification.Send.Group', type: 'Application' },
      { name: 'MeetingStage.Write.Chat', type: 'Delegated' },
    ]);
    expect(existsSync(path.join(NEXUS, 'src/app/(pad)/pad/stage/page.tsx'))).toBe(true);
    expect(isTeamsPadPath('/pad/stage')).toBe(true);
  });

  it('keeps names and descriptions within Teams limits, with no en or em dashes', () => {
    expect(manifest.name.short.length).toBeLessThanOrEqual(30);
    expect(manifest.description.short.length).toBeLessThanOrEqual(80);
    expect(manifest.description.full.length).toBeLessThanOrEqual(4000);
    expect(JSON.stringify([manifest.name, manifest.description, manifest.staticTabs])).not.toMatch(/[–—]/);
  });
});
