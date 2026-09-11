// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@neram/auth', () => ({
  getAppOnlyToken: vi.fn(async () => 'header.e30.signature'),
  classifyGraphError: (raw: string) => {
    const denied = / 403\b/.test(raw);
    return {
      code: denied ? 'insufficient_permission' : 'unknown',
      message: denied ? 'The Microsoft app is missing the required permission.' : 'The Microsoft Graph request failed.',
      fix: denied ? 'generic fix' : undefined,
      raw,
    };
  },
}));

import { getAppOnlyToken } from '@neram/auth';
import {
  addUserToGroup,
  assignLicense,
  createEntraUser,
  isAlreadyExistsError,
  isUpnAvailable,
  listSubscribedSkus,
  readAppRoles,
  readLicenseStates,
  resetEntraPassword,
} from './entra-accounts';

const fetchMock = vi.fn();

function reply(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

function sentBody(call = 0): any {
  return JSON.parse(String(fetchMock.mock.calls[call][1].body));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('readAppRoles', () => {
  it('reads the permissions from the app token without calling Graph', async () => {
    const payload = btoa(JSON.stringify({ roles: ['User.Create'] })).replace(/=+$/, '');
    vi.mocked(getAppOnlyToken).mockResolvedValueOnce(`h.${payload}.s`);
    await expect(readAppRoles()).resolves.toEqual({ ok: true, value: ['User.Create'] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a token failure instead of throwing', async () => {
    vi.mocked(getAppOnlyToken).mockRejectedValueOnce(new Error('AADSTS7000222 expired'));
    const result = await readAppRoles();
    expect(result.ok).toBe(false);
  });
});

describe('isUpnAvailable', () => {
  it('treats a 404 as free and a found user as taken', async () => {
    fetchMock.mockResolvedValueOnce(reply(404, { error: { code: 'Request_ResourceNotFound' } }));
    await expect(isUpnAvailable('Dhisha_Haribabu@neramclasses.com')).resolves.toEqual({ ok: true, value: true });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/users/Dhisha_Haribabu%40neramclasses.com');

    fetchMock.mockResolvedValueOnce(reply(200, { id: 'x' }));
    await expect(isUpnAvailable('Afrin_banu@neramclasses.com')).resolves.toEqual({ ok: true, value: false });
  });

  it('never throws on a network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('socket hang up'));
    const result = await isUpnAvailable('a@neramclasses.com');
    expect(result).toMatchObject({ ok: false, status: 0 });
  });
});

describe('createEntraUser', () => {
  const input = {
    displayName: 'Dhisha Haribabu',
    givenName: 'Dhisha',
    surname: 'Haribabu',
    upn: 'Dhisha_Haribabu@neramclasses.com',
    mailNickname: 'Dhisha_Haribabu',
    password: 'Ab3#kP9m$Qr2',
    mobilePhone: '+91 9876543210',
    usageLocation: 'IN',
  };

  it('creates an enabled account that must change its password, located in India', async () => {
    fetchMock.mockResolvedValueOnce(reply(201, { id: 'oid-1' }));
    await expect(createEntraUser(input)).resolves.toEqual({ ok: true, value: { id: 'oid-1' } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://graph.microsoft.com/v1.0/users');
    expect(init.method).toBe('POST');
    expect(sentBody()).toEqual({
      accountEnabled: true,
      displayName: 'Dhisha Haribabu',
      givenName: 'Dhisha',
      surname: 'Haribabu',
      mailNickname: 'Dhisha_Haribabu',
      userPrincipalName: 'Dhisha_Haribabu@neramclasses.com',
      usageLocation: 'IN',
      mobilePhone: '+91 9876543210',
      passwordProfile: { forceChangePasswordNextSignIn: true, password: 'Ab3#kP9m$Qr2' },
    });
  });

  it('names the exact permission when Azure refuses', async () => {
    fetchMock.mockResolvedValueOnce(reply(403, { error: { code: 'Authorization_RequestDenied' } }));
    const result = await createEntraUser(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
    expect(result.error.code).toBe('insufficient_permission');
    expect(result.error.fix).toContain('User.Create');
  });

  it('recognises a login ID that already exists', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(400, { error: { message: 'Another object with the same value for property userPrincipalName already exists.' } }),
    );
    const result = await createEntraUser(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(isAlreadyExistsError(result.error)).toBe(true);
  });
});

describe('assignLicense and addUserToGroup', () => {
  it('waits for a brand new account to appear before licensing it', async () => {
    fetchMock.mockResolvedValueOnce(reply(404)).mockResolvedValueOnce(reply(200, {}));
    await expect(assignLicense('oid-1', 'sku-1', { waitMs: 0 })).resolves.toEqual({ ok: true, value: undefined });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentBody(1)).toEqual({ addLicenses: [{ skuId: 'sku-1', disabledPlans: [] }], removeLicenses: [] });
  });

  it('explains running out of seats', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(400, { error: { message: 'License assignment failed because subscription does not have any available licenses.' } }),
    );
    const result = await assignLicense('oid-1', 'sku-1', { waitMs: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/no free student licenses/);
  });

  it('treats being in the licensing group already as done', async () => {
    fetchMock.mockResolvedValueOnce(reply(400, { error: { message: 'One or more added object references already exist' } }));
    await expect(addUserToGroup('group-1', 'oid-1', { waitMs: 0 })).resolves.toEqual({ ok: true, value: undefined });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/groups/group-1/members/$ref');
  });
});

describe('resetEntraPassword', () => {
  it('sets a temporary password that must be changed', async () => {
    fetchMock.mockResolvedValueOnce(reply(204));
    await expect(resetEntraPassword('oid-1', 'Zz9@abcdefgh')).resolves.toEqual({ ok: true, value: undefined });
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
    expect(sentBody()).toEqual({ passwordProfile: { forceChangePasswordNextSignIn: true, password: 'Zz9@abcdefgh' } });
  });

  it('names the password permission when refused', async () => {
    fetchMock.mockResolvedValueOnce(reply(403, { error: { code: 'Authorization_RequestDenied' } }));
    const result = await resetEntraPassword('oid-1', 'x');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fix).toContain('User-PasswordProfile.ReadWrite.All');
  });
});

describe('license reads', () => {
  it('lists enabled subscriptions with their seats', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(200, {
        value: [
          { skuId: 'a1', skuPartNumber: 'STANDARDWOFFPACK_STUDENT', prepaidUnits: { enabled: 500 }, consumedUnits: 88, capabilityStatus: 'Enabled' },
          { skuId: 'old', skuPartNumber: 'OLD', prepaidUnits: { enabled: 10 }, consumedUnits: 0, capabilityStatus: 'Suspended' },
        ],
      }),
    );
    await expect(listSubscribedSkus()).resolves.toEqual({
      ok: true,
      value: [{ skuId: 'a1', skuPartNumber: 'STANDARDWOFFPACK_STUDENT', enabled: 500, consumed: 88 }],
    });
  });

  it('keeps the licensing group of each license', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(200, {
        licenseAssignmentStates: [
          { skuId: 'a1', assignedByGroup: 'group-1', state: 'Active' },
          { skuId: 'teams', assignedByGroup: null, state: 'Active' },
        ],
      }),
    );
    await expect(readLicenseStates('oid-1')).resolves.toEqual({
      ok: true,
      value: [
        { skuId: 'a1', groupId: 'group-1' },
        { skuId: 'teams', groupId: null },
      ],
    });
  });
});
