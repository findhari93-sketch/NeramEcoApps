/**
 * Microsoft Graph calls for student accounts, app-only.
 *
 * Nexus-local on purpose: packages/auth is shared by all four apps, and a change
 * there redeploys every one of them. Built on the exported getAppOnlyToken and
 * classifyGraphError. Every function returns a result instead of throwing, and
 * nothing here logs a request body, because two of them carry a password.
 */

import { classifyGraphError, getAppOnlyToken, type GraphErrorInfo } from '@neram/auth';
import { decodeTokenRoles, describeLicenseFailure, type LicenseState } from './student-account-rules';

const GRAPH = 'https://graph.microsoft.com/v1.0';

export type GraphResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: GraphErrorInfo };

type GraphFailure = { ok: false; status: number; error: GraphErrorInfo };

export interface RetryOptions {
  attempts?: number;
  waitMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function graph(path: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<Response> {
  const token = await getAppOnlyToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${GRAPH}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...((init.headers as Record<string, string>) || {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A failed response as something staff can act on. A missing permission names
 * the exact Azure permission this call needs, rather than the generic advice
 * classifyGraphError gives for offboarding.
 */
async function failed(res: Response, permission?: string): Promise<GraphFailure> {
  const text = await res.text().catch(() => '');
  const error = classifyGraphError(`Graph ${res.status} ${text}`);
  if (error.code === 'insufficient_permission' && permission) {
    return {
      ok: false,
      status: res.status,
      error: {
        ...error,
        fix: `In Azure Portal, open App registrations, then this app's API permissions. Add the Microsoft Graph application permission ${permission} and grant admin consent.`,
      },
    };
  }
  const license = describeLicenseFailure(text);
  return { ok: false, status: res.status, error: license ? { ...error, message: license } : error };
}

function thrown(err: unknown): GraphFailure {
  return {
    ok: false,
    status: 0,
    error: classifyGraphError(err instanceof Error ? err.message : String(err)),
  };
}

/** The permissions granted to this app, read from its own token. No request to Graph. */
export async function readAppRoles(): Promise<GraphResult<string[]>> {
  try {
    return { ok: true, value: decodeTokenRoles(await getAppOnlyToken()) };
  } catch (err) {
    return thrown(err);
  }
}

/** Is this login ID free? A 404 is the answer "yes". */
export async function isUpnAvailable(upn: string): Promise<GraphResult<boolean>> {
  try {
    const res = await graph(`/users/${encodeURIComponent(upn)}?$select=id`);
    if (res.status === 404) return { ok: true, value: true };
    if (res.ok) return { ok: true, value: false };
    return failed(res, 'User.Read.All');
  } catch (err) {
    return thrown(err);
  }
}

export interface CreateEntraUserInput {
  displayName: string;
  givenName: string | null;
  surname: string | null;
  upn: string;
  mailNickname: string;
  password: string;
  /** "+91 9876543210". Stored on the account so a later reconcile can match by phone. */
  mobilePhone: string | null;
  usageLocation: string;
}

export async function createEntraUser(input: CreateEntraUserInput): Promise<GraphResult<{ id: string }>> {
  try {
    const res = await graph('/users', {
      method: 'POST',
      body: JSON.stringify({
        accountEnabled: true,
        displayName: input.displayName,
        ...(input.givenName ? { givenName: input.givenName } : {}),
        ...(input.surname ? { surname: input.surname } : {}),
        mailNickname: input.mailNickname,
        userPrincipalName: input.upn,
        // Microsoft refuses to license an account with no usage location.
        usageLocation: input.usageLocation,
        ...(input.mobilePhone ? { mobilePhone: input.mobilePhone } : {}),
        passwordProfile: { forceChangePasswordNextSignIn: true, password: input.password },
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { id?: unknown };
      return { ok: true, value: { id: String(data.id) } };
    }
    return failed(res, 'User.Create');
  } catch (err) {
    return thrown(err);
  }
}

/** True when Graph refused a create because the login ID or an alias already exists. */
export function isAlreadyExistsError(error: GraphErrorInfo): boolean {
  return /already exists/i.test(error.raw || '');
}

export async function assignLicense(
  userId: string,
  skuId: string,
  retry: RetryOptions = {},
): Promise<GraphResult<void>> {
  const attempts = retry.attempts ?? 4;
  const waitMs = retry.waitMs ?? 2_000;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await graph(`/users/${encodeURIComponent(userId)}/assignLicense`, {
        method: 'POST',
        body: JSON.stringify({ addLicenses: [{ skuId, disabledPlans: [] }], removeLicenses: [] }),
      });
      if (res.ok) return { ok: true, value: undefined };
      // An account created a moment ago can still be invisible to this endpoint.
      if (res.status === 404 && attempt < attempts) {
        await sleep(waitMs);
        continue;
      }
      return failed(res, 'LicenseAssignment.ReadWrite.All');
    } catch (err) {
      if (attempt < attempts) {
        await sleep(waitMs);
        continue;
      }
      return thrown(err);
    }
  }
}

/** For a tenant that licenses students through a group rather than directly. */
export async function addUserToGroup(
  groupId: string,
  userId: string,
  retry: RetryOptions = {},
): Promise<GraphResult<void>> {
  const attempts = retry.attempts ?? 4;
  const waitMs = retry.waitMs ?? 2_000;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await graph(`/groups/${encodeURIComponent(groupId)}/members/$ref`, {
        method: 'POST',
        body: JSON.stringify({ '@odata.id': `${GRAPH}/directoryObjects/${userId}` }),
      });
      if (res.ok) return { ok: true, value: undefined };
      if (res.status === 400) {
        const text = await res.text().catch(() => '');
        if (/already exist/i.test(text)) return { ok: true, value: undefined };
        return { ok: false, status: 400, error: classifyGraphError(`Graph 400 ${text}`) };
      }
      if (res.status === 404 && attempt < attempts) {
        await sleep(waitMs);
        continue;
      }
      return failed(res, 'GroupMember.ReadWrite.All');
    } catch (err) {
      if (attempt < attempts) {
        await sleep(waitMs);
        continue;
      }
      return thrown(err);
    }
  }
}

/** The student's personal email on their Microsoft account, which later matching reads. */
export async function setOtherMails(userId: string, emails: string[]): Promise<GraphResult<void>> {
  try {
    const res = await graph(`/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ otherMails: emails }),
    });
    if (res.ok) return { ok: true, value: undefined };
    return failed(res, 'User-Mail.ReadWrite.All');
  } catch (err) {
    return thrown(err);
  }
}

export async function resetEntraPassword(userId: string, password: string): Promise<GraphResult<void>> {
  try {
    const res = await graph(`/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ passwordProfile: { forceChangePasswordNextSignIn: true, password } }),
    });
    if (res.ok) return { ok: true, value: undefined };
    return failed(res, 'User-PasswordProfile.ReadWrite.All');
  } catch (err) {
    return thrown(err);
  }
}

export interface SubscribedSku {
  skuId: string;
  skuPartNumber: string;
  enabled: number;
  consumed: number;
}

export async function listSubscribedSkus(): Promise<GraphResult<SubscribedSku[]>> {
  try {
    const res = await graph('/subscribedSkus?$select=skuId,skuPartNumber,prepaidUnits,consumedUnits,capabilityStatus');
    if (!res.ok) return failed(res, 'LicenseAssignment.Read.All');
    const data = (await res.json()) as { value?: any[] };
    const skus = (data.value || [])
      .filter((sku) => sku?.skuId && (!sku.capabilityStatus || sku.capabilityStatus === 'Enabled'))
      .map((sku) => ({
        skuId: String(sku.skuId),
        skuPartNumber: String(sku.skuPartNumber || ''),
        enabled: Number(sku.prepaidUnits?.enabled) || 0,
        consumed: Number(sku.consumedUnits) || 0,
      }));
    return { ok: true, value: skus };
  } catch (err) {
    return thrown(err);
  }
}

/** Which licenses one user holds, and the group each came from when it did. */
export async function readLicenseStates(userId: string): Promise<GraphResult<LicenseState[]>> {
  try {
    const res = await graph(
      `/users/${encodeURIComponent(userId)}?$select=assignedLicenses,licenseAssignmentStates`,
    );
    if (!res.ok) return failed(res, 'User.Read.All');
    const data = (await res.json()) as { assignedLicenses?: any[]; licenseAssignmentStates?: any[] };
    const states = (data.licenseAssignmentStates || [])
      .filter((state) => state?.skuId)
      .map((state) => ({ skuId: String(state.skuId), groupId: state.assignedByGroup ? String(state.assignedByGroup) : null }));
    if (states.length) return { ok: true, value: states };
    // Directories that do not return assignment states still list the licenses.
    return {
      ok: true,
      value: (data.assignedLicenses || [])
        .filter((license) => license?.skuId)
        .map((license) => ({ skuId: String(license.skuId), groupId: null })),
    };
  } catch (err) {
    return thrown(err);
  }
}

export async function readUserPrincipalName(userId: string): Promise<GraphResult<string>> {
  try {
    const res = await graph(`/users/${encodeURIComponent(userId)}?$select=userPrincipalName`);
    if (!res.ok) return failed(res, 'User.Read.All');
    const data = (await res.json()) as { userPrincipalName?: unknown };
    return { ok: true, value: String(data.userPrincipalName || '') };
  } catch (err) {
    return thrown(err);
  }
}
