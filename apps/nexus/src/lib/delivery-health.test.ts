import { describe, expect, it } from 'vitest';
import { decodeTokenRoles, envReport, missingRoles, summariseReceipts } from './delivery-health';

const jwt = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

describe('delivery health', () => {
  it('reads the roles Microsoft granted and names the missing ones', () => {
    const roles = decodeTokenRoles(jwt({ roles: ['TeamsActivity.Send', 'User.Read.All'] }));
    expect(roles).toEqual(['TeamsActivity.Send', 'User.Read.All']);
    expect(missingRoles(roles)).toEqual(['TeamsAppInstallation.ReadWriteForUser.All']);
    expect(decodeTokenRoles('garbage')).toEqual([]);
  });

  it('flags a missing key and one pasted with a Windows newline, and never asks for an email key', () => {
    const report = envReport({ AZ_CLIENT_ID: 'x', TEAMS_APP_CATALOG_ID: 'abc\r\n' });
    expect(report.AZ_CLIENT_ID).toBe('set');
    expect(report.TEAMS_APP_CATALOG_ID).toBe('has_whitespace');
    expect(report.AZ_TENANT_ID).toBe('missing');
    expect(Object.keys(report)).not.toContain('RESEND_API_KEY');
  });

  it('counts bell-only sends and surfaces the most common reason per tier', () => {
    const base = { event_type: 'assignment_nudge', chat: false, reasons: null };
    const summary = summariseReceipts([
      { ...base, teams: false, inapp: true, channel: 'inapp', reasons: { teams: 'install 403', chat: 'not connected' } },
      { ...base, teams: false, inapp: true, channel: 'inapp', reasons: { teams: 'install 403' } },
      { ...base, chat: true, teams: false, inapp: true, channel: 'chat+inapp' },
      { ...base, teams: false, inapp: false, channel: 'dormant' },
    ]);
    expect(summary[0]).toMatchObject({ sends: 3, skipped: 1, chat: 1, inapp: 3, bellOnly: 2, topReasons: { teams: 'install 403', chat: 'not connected' } });
  });
});
