import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setAccountEnabled, removeAllLicenses, addLicenses, classifyGraphError, getUserMsStatus, getUserProfile, getUserPhoto } from './graph';

// These tests mock global.fetch so no real Microsoft Graph call is made. The
// app-only token endpoint is mocked alongside the Graph endpoints.

const realFetch = global.fetch;

beforeEach(() => {
  process.env.AZ_CLIENT_ID = 'test-client';
  process.env.AZ_CLIENT_SECRET = 'test-secret';
  process.env.AZ_TENANT_ID = 'test-tenant';
});

afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

function mockGraph(handler: (url: string, init: any) => Response | Promise<Response>) {
  global.fetch = vi.fn((url: any, init: any) => {
    const u = String(url);
    if (u.includes('oauth2/v2.0/token')) {
      return Promise.resolve(
        new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 }),
      );
    }
    return Promise.resolve(handler(u, init));
  }) as any;
}

describe('classifyGraphError', () => {
  it('maps an expired client secret (AADSTS7000222) to secret_expired', () => {
    const raw =
      'Failed to get app-only token: 401 {"error":"invalid_client","error_description":"AADSTS7000222: The provided client secret keys for app \'aa039c70\' are expired."}';
    const info = classifyGraphError(raw);
    expect(info.code).toBe('secret_expired');
    expect(info.fix).toMatch(/AZ_CLIENT_SECRET/);
    expect(info.raw).toBeTruthy();
  });

  it('maps a 403 / Authorization_RequestDenied to insufficient_permission', () => {
    const info = classifyGraphError('Graph API error: 403 {"error":{"code":"Authorization_RequestDenied"}}');
    expect(info.code).toBe('insufficient_permission');
    expect(info.fix).toMatch(/User\.ReadWrite\.All/);
  });

  it('maps the missing-env message to not_configured', () => {
    const info = classifyGraphError('AZ_CLIENT_ID, AZ_CLIENT_SECRET, and AZ_TENANT_ID are required for app-only auth');
    expect(info.code).toBe('not_configured');
  });

  it('falls back to unknown for unrecognised errors', () => {
    expect(classifyGraphError('some random network blip').code).toBe('unknown');
    expect(classifyGraphError('').code).toBe('unknown');
  });
});

describe('setAccountEnabled', () => {
  it('PATCHes accountEnabled on the user and reports success', async () => {
    let patched: any = null;
    mockGraph((url, init) => {
      if (init?.method === 'PATCH') {
        patched = { url, body: JSON.parse(init.body) };
        return new Response(null, { status: 204 });
      }
      return new Response('not found', { status: 404 });
    });

    const res = await setAccountEnabled('oid-123', false);
    expect(res.success).toBe(true);
    expect(patched.url).toContain('/users/oid-123');
    expect(patched.body).toEqual({ accountEnabled: false });
  });

  it('reports failure on a Graph error', async () => {
    mockGraph(() => new Response('forbidden', { status: 403 }));
    const res = await setAccountEnabled('oid-123', false);
    expect(res.success).toBe(false);
    expect(res.reason).toContain('403');
  });
});

describe('removeAllLicenses', () => {
  it('removes directly-assigned SKUs and reports group-assigned ones', async () => {
    let assignBody: any = null;
    mockGraph((url, init) => {
      if (url.includes('assignLicense')) {
        assignBody = JSON.parse(init.body);
        return new Response(JSON.stringify({ id: 'oid-123' }), { status: 200 });
      }
      // GET license info
      return new Response(
        JSON.stringify({
          assignedLicenses: [{ skuId: 'sku-A' }, { skuId: 'sku-B' }],
          licenseAssignmentStates: [
            { skuId: 'sku-A', assignedByGroup: null },
            { skuId: 'sku-B', assignedByGroup: 'group-1' },
          ],
        }),
        { status: 200 },
      );
    });

    const res = await removeAllLicenses('oid-123');
    expect(res.success).toBe(true);
    expect(res.removedSkuIds).toEqual(['sku-A']);
    expect(res.groupSkuIds).toEqual(['sku-B']);
    // Only the direct SKU is sent to removeLicenses.
    expect(assignBody.removeLicenses).toEqual(['sku-A']);
    expect(assignBody.addLicenses).toEqual([]);
  });

  it('no-ops cleanly when there are no direct licenses', async () => {
    mockGraph(() =>
      new Response(JSON.stringify({ assignedLicenses: [], licenseAssignmentStates: [] }), { status: 200 }),
    );
    const res = await removeAllLicenses('oid-123');
    expect(res.success).toBe(true);
    expect(res.removedSkuIds).toEqual([]);
  });
});

describe('getUserMsStatus', () => {
  it('returns accountEnabled + direct/group licenses', async () => {
    mockGraph(() =>
      new Response(
        JSON.stringify({
          accountEnabled: false,
          assignedLicenses: [{ skuId: 'A' }, { skuId: 'B' }],
          licenseAssignmentStates: [
            { skuId: 'A', assignedByGroup: null },
            { skuId: 'B', assignedByGroup: 'group-1' },
          ],
        }),
        { status: 200 },
      ),
    );
    const s = await getUserMsStatus('oid-1');
    expect(s.accountEnabled).toBe(false);
    expect(s.directSkuIds).toEqual(['A']);
    expect(s.groupSkuIds).toEqual(['B']);
  });
});

describe('getUserProfile', () => {
  it('returns the selected profile fields', async () => {
    mockGraph(() => new Response(JSON.stringify({ displayName: 'Jane', mail: 'j@x.com', jobTitle: 'Student' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const p = await getUserProfile('oid-1');
    expect(p?.displayName).toBe('Jane');
    expect(p?.mail).toBe('j@x.com');
  });
  it('returns null on a Graph error', async () => {
    mockGraph(() => new Response('nope', { status: 404 }));
    expect(await getUserProfile('oid-1')).toBeNull();
  });
});

describe('getUserPhoto', () => {
  it('returns buffer + contentType when a photo exists', async () => {
    mockGraph(() => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { 'content-type': 'image/png' } }));
    const ph = await getUserPhoto('oid-1');
    expect(ph).not.toBeNull();
    expect(ph?.contentType).toBe('image/png');
    expect(ph?.buffer.length).toBe(4);
  });
  it('returns null when there is no photo (404)', async () => {
    mockGraph(() => new Response(null, { status: 404 }));
    expect(await getUserPhoto('oid-1')).toBeNull();
  });
});

describe('addLicenses', () => {
  it('adds the given SKUs back', async () => {
    let assignBody: any = null;
    mockGraph((url, init) => {
      if (url.includes('assignLicense')) {
        assignBody = JSON.parse(init.body);
        return new Response(JSON.stringify({ id: 'oid-123' }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    const res = await addLicenses('oid-123', ['sku-A']);
    expect(res.success).toBe(true);
    expect(assignBody.addLicenses).toEqual([{ skuId: 'sku-A', disabledPlans: [] }]);
    expect(assignBody.removeLicenses).toEqual([]);
  });

  it('is a no-op for an empty SKU list', async () => {
    mockGraph(() => new Response('should not be called', { status: 500 }));
    const res = await addLicenses('oid-123', []);
    expect(res.success).toBe(true);
  });
});
