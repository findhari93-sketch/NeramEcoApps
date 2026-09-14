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

  it('flags a missing key and one pasted with a Windows newline', () => {
    const report = envReport({ AZ_CLIENT_ID: 'x', TEAMS_APP_CATALOG_ID: 'abc\r\n', RESEND_API_KEY: '  ' });
    expect(report.AZ_CLIENT_ID).toBe('set');
    expect(report.TEAMS_APP_CATALOG_ID).toBe('has_whitespace');
    expect(report.RESEND_API_KEY).toBe('missing');
  });

  it('counts bell-only sends and surfaces the most common reason per tier', () => {
    const base = { event_type: 'assignment_nudge', chat: false, bot: false, email: false, reasons: null };
    const summary = summariseReceipts([
      { ...base, teams: false, inapp: true, channel: 'inapp', reasons: { teams: 'install 403', email: 'no key' } },
      { ...base, teams: false, inapp: true, channel: 'inapp', reasons: { teams: 'install 403' } },
      { ...base, teams: true, inapp: true, channel: 'teams+inapp' },
      { ...base, teams: false, inapp: false, channel: 'dormant' },
    ]);
    expect(summary[0]).toMatchObject({ sends: 3, skipped: 1, teams: 1, inapp: 3, bellOnly: 2, topReasons: { teams: 'install 403', email: 'no key' } });
  });
});
