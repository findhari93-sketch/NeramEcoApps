/**
 * Microsoft Graph API - App-only (client credentials) token utility.
 *
 * Shared by: student app (Teams auto-add), Nexus (SharePoint, Teams sync)
 * Requires env vars: AZ_CLIENT_ID, AZ_CLIENT_SECRET, AZ_TENANT_ID
 */

/** Cache for app-only tokens (client credentials flow) */
let appTokenCache: { token: string; expiresAt: number } | null = null;

/**
 * Get an app-only (client credentials) Graph API token.
 * Caches the token and returns from cache if still valid (with 60s buffer).
 */
export async function getAppOnlyToken(): Promise<string> {
  if (appTokenCache && Date.now() < appTokenCache.expiresAt - 60_000) {
    return appTokenCache.token;
  }

  const clientId = process.env.AZ_CLIENT_ID;
  const clientSecret = process.env.AZ_CLIENT_SECRET;
  const tenantId = process.env.AZ_TENANT_ID;

  if (!clientId || !clientSecret || !tenantId) {
    throw new Error('AZ_CLIENT_ID, AZ_CLIENT_SECRET, and AZ_TENANT_ID are required for app-only auth');
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Failed to get app-only token: ${res.status} ${err}`);
  }

  const data = await res.json();
  appTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

/**
 * Add a member to a Microsoft Teams team using the Graph API.
 * Requires TeamMember.ReadWrite.All application permission.
 *
 * @param teamId - The Teams team/group ID
 * @param userPrincipalName - The user's email/UPN in Azure AD
 * @returns Object with success status and optional reason
 */
export async function addMemberToTeam(
  teamId: string,
  userPrincipalName: string
): Promise<{ success: boolean; reason?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const token = await getAppOnlyToken();

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/teams/${teamId}/members`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          '@odata.type': '#microsoft.graph.aadUserConversationMember',
          'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${userPrincipalName}')`,
          roles: [],
        }),
        signal: controller.signal,
      }
    );

    if (res.ok) {
      return { success: true };
    }

    // 409 = already a member — treat as success
    if (res.status === 409) {
      return { success: true, reason: 'already_member' };
    }

    const errText = await res.text().catch(() => '');
    return { success: false, reason: `Graph API error: ${res.status} ${errText}` };
  } catch (error) {
    return { success: false, reason: error instanceof Error ? error.message : 'Unknown error' };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// Account offboarding (alumni graduation)
// ============================================================
//
// These require the Graph app registration to have the **User.ReadWrite.All**
// application permission with admin consent (covers PATCH accountEnabled and
// the assignLicense action). Reading assignedLicenses is covered by User.Read.All.

export interface GraphErrorInfo {
  code:
    | 'secret_expired'
    | 'invalid_client'
    | 'insufficient_permission'
    | 'not_configured'
    | 'account_not_found'
    | 'unknown';
  /** Short, plain-language summary. */
  message: string;
  /** What the admin should do to fix it (when known). */
  fix?: string;
  /** Original error text (truncated), for a collapsible "technical details" view. */
  raw?: string;
}

/**
 * Map a raw Microsoft Graph / Entra error string to a short, actionable message.
 * Keeps the noisy AADSTS JSON out of the UI while still pointing at the real fix.
 */
export function classifyGraphError(raw: string | null | undefined): GraphErrorInfo {
  const text = (raw || '').toString();
  const t = text.toLowerCase();
  const trimmed = text.length > 600 ? `${text.slice(0, 600)}…` : text;

  if (t.includes('aadsts7000222') || (t.includes('client secret') && t.includes('expired'))) {
    return {
      code: 'secret_expired',
      message: 'The Microsoft app client secret has expired.',
      fix: 'In Azure Portal → App registrations → your app → Certificates & secrets, create a new client secret, then update AZ_CLIENT_SECRET (local .env.local and Vercel) and retry.',
      raw: trimmed,
    };
  }
  if (t.includes('required for app-only auth') || t.includes('not configured')) {
    return {
      code: 'not_configured',
      message: 'Microsoft credentials are not configured on the server.',
      fix: 'Set AZ_CLIENT_ID, AZ_CLIENT_SECRET and AZ_TENANT_ID in the environment, then retry.',
      raw: trimmed,
    };
  }
  // A 404 Request_ResourceNotFound means the Microsoft account that this student's
  // stored ms_oid pointed at no longer exists (deleted, or never persisted). For
  // offboarding this is a benign terminal state: there is no account left to
  // disable or unlicense, so it must NOT be reported as a hard failure.
  if (
    t.includes('request_resourcenotfound') ||
    t.includes('resourcenotfound') ||
    (t.includes('does not exist') && /\b404\b/.test(text))
  ) {
    return {
      code: 'account_not_found',
      message: 'No active Microsoft account (it was already removed).',
      fix: 'Nothing to do: this student has no Microsoft account, so there is no license or sign-in to revoke.',
      raw: trimmed,
    };
  }
  if (t.includes('invalid_client') || t.includes('aadsts7000215') || t.includes('aadsts700016')) {
    return {
      code: 'invalid_client',
      message: 'The Microsoft app credentials are invalid.',
      fix: 'Check AZ_CLIENT_ID / AZ_TENANT_ID, and that AZ_CLIENT_SECRET matches a current (non-expired) secret in Azure.',
      raw: trimmed,
    };
  }
  if (
    t.includes('authorization_requestdenied') ||
    t.includes('insufficient privileges') ||
    t.includes('accessdenied') ||
    t.includes('"status":403') ||
    / 403\b/.test(text)
  ) {
    return {
      code: 'insufficient_permission',
      message: 'The Microsoft app is missing the required permission.',
      fix: 'In Azure Portal → API permissions, add Microsoft Graph application permission User.ReadWrite.All and click "Grant admin consent", then retry.',
      raw: trimmed,
    };
  }
  return { code: 'unknown', message: 'The Microsoft Graph request failed.', raw: trimmed };
}

/**
 * Pre-flight: can we obtain an app-only token at all? Returns a classified error
 * (expired secret, missing config, …) instead of throwing, so a caller can show a
 * single clear banner rather than failing identically for every user.
 */
export async function checkGraphConnection(): Promise<{ ok: boolean; error?: GraphErrorInfo }> {
  try {
    await getAppOnlyToken();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: classifyGraphError(error instanceof Error ? error.message : String(error)) };
  }
}

/** Authenticated Graph fetch with an app-only token and a timeout. */
async function graphFetch(path: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const token = await getAppOnlyToken();
    return await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface UserLicenseInfo {
  /** SKU ids assigned directly to the user (removable via assignLicense). */
  directSkuIds: string[];
  /** SKU ids assigned via a group (NOT removable per-user; needs group removal). */
  groupSkuIds: string[];
}

/**
 * Read which M365 license SKUs a user has, split into direct vs group-assigned.
 * Group-assigned licenses cannot be freed by assignLicense (they require removing
 * the user from the licensing group), so we surface them separately.
 *
 * @param userId - the user's Entra object id (ms_oid) or UPN.
 */
export async function getUserAssignedLicenses(userId: string): Promise<UserLicenseInfo> {
  const res = await graphFetch(
    `/users/${encodeURIComponent(userId)}?$select=assignedLicenses,licenseAssignmentStates`
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Graph getUserAssignedLicenses ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const states: any[] = data.licenseAssignmentStates || [];
  const direct = new Set<string>();
  const group = new Set<string>();
  for (const s of states) {
    if (!s?.skuId) continue;
    if (s.assignedByGroup) group.add(s.skuId);
    else direct.add(s.skuId);
  }
  // Fallback for directories that don't return assignment states.
  if (states.length === 0) {
    for (const l of data.assignedLicenses || []) if (l?.skuId) direct.add(l.skuId);
  }
  return { directSkuIds: [...direct], groupSkuIds: [...group] };
}

/**
 * Read a user's current Microsoft offboarding status: whether sign-in is enabled
 * and which licenses they still hold (direct vs group). Throws on Graph error so
 * callers can classify it.
 */
export async function getUserMsStatus(
  userId: string,
): Promise<{ accountEnabled: boolean | null; directSkuIds: string[]; groupSkuIds: string[] }> {
  const res = await graphFetch(
    `/users/${encodeURIComponent(userId)}?$select=accountEnabled,assignedLicenses,licenseAssignmentStates`,
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Graph getUserMsStatus ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const states: any[] = data.licenseAssignmentStates || [];
  const direct = new Set<string>();
  const group = new Set<string>();
  for (const s of states) {
    if (!s?.skuId) continue;
    if (s.assignedByGroup) group.add(s.skuId);
    else direct.add(s.skuId);
  }
  if (states.length === 0) {
    for (const l of data.assignedLicenses || []) if (l?.skuId) direct.add(l.skuId);
  }
  return {
    accountEnabled: typeof data.accountEnabled === 'boolean' ? data.accountEnabled : null,
    directSkuIds: [...direct],
    groupSkuIds: [...group],
  };
}

/**
 * Read a Microsoft user's directory profile (a snapshot to preserve before
 * offboarding). Returns null on any error so callers can continue best-effort.
 */
export async function getUserProfile(userId: string): Promise<Record<string, any> | null> {
  try {
    const res = await graphFetch(
      `/users/${encodeURIComponent(userId)}?$select=displayName,givenName,surname,mail,userPrincipalName,mobilePhone,businessPhones,jobTitle,department,officeLocation,preferredLanguage,city,country`,
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Fetch a Microsoft user's profile photo bytes. Returns null when there is no
 * photo (404) or on any error. App-only read access (User.Read.All) suffices.
 */
export async function getUserPhoto(
  userId: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const res = await graphFetch(`/users/${encodeURIComponent(userId)}/photo/$value`);
    if (!res.ok) return null; // 404 = no photo set
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await res.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) return null;
    return { buffer: Buffer.from(arrayBuffer), contentType };
  } catch {
    return null;
  }
}

/** Low-level assignLicense action (add and/or remove SKUs). */
async function assignLicense(userId: string, addSkuIds: string[], removeSkuIds: string[]): Promise<void> {
  const res = await graphFetch(`/users/${encodeURIComponent(userId)}/assignLicense`, {
    method: 'POST',
    body: JSON.stringify({
      addLicenses: addSkuIds.map((skuId) => ({ skuId, disabledPlans: [] })),
      removeLicenses: removeSkuIds,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Graph assignLicense ${res.status}: ${errText}`);
  }
}

/**
 * Remove all directly-assigned M365 licenses from a user (frees the paid seats).
 * Returns the removed SKU ids so a later restore can re-add exactly those, and the
 * group-assigned SKUs it could NOT remove (so the caller can report them).
 */
export async function removeAllLicenses(
  userId: string
): Promise<{ success: boolean; removedSkuIds: string[]; groupSkuIds: string[]; reason?: string }> {
  try {
    const { directSkuIds, groupSkuIds } = await getUserAssignedLicenses(userId);
    if (directSkuIds.length === 0) {
      return { success: true, removedSkuIds: [], groupSkuIds };
    }
    await assignLicense(userId, [], directSkuIds);
    return { success: true, removedSkuIds: directSkuIds, groupSkuIds };
  } catch (error) {
    return {
      success: false,
      removedSkuIds: [],
      groupSkuIds: [],
      reason: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/** Re-add licenses by SKU id (used on restore to reverse removeAllLicenses). */
export async function addLicenses(
  userId: string,
  skuIds: string[]
): Promise<{ success: boolean; reason?: string }> {
  try {
    if (!skuIds || skuIds.length === 0) return { success: true };
    await assignLicense(userId, skuIds, []);
    return { success: true };
  } catch (error) {
    return { success: false, reason: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Enable or disable a user's Entra sign-in (accountEnabled). Disabling blocks all
 * Microsoft sign-in (Teams, email) without deleting the account; fully reversible.
 */
export async function setAccountEnabled(
  userId: string,
  enabled: boolean
): Promise<{ success: boolean; reason?: string }> {
  try {
    const res = await graphFetch(`/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ accountEnabled: enabled }),
    });
    if (res.ok || res.status === 204) return { success: true };
    const errText = await res.text().catch(() => '');
    return { success: false, reason: `Graph API error: ${res.status} ${errText}` };
  } catch (error) {
    return { success: false, reason: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Add a member to a Microsoft Teams group chat using the Graph API.
 * Requires ChatMember.ReadWrite.All or Chat.ReadWrite.All application permission.
 *
 * @param chatId - The Teams chat thread ID (e.g., "19:xxx@thread.v2")
 * @param userPrincipalName - The user's email/UPN in Azure AD
 * @returns Object with success status and optional reason
 */
export async function addMemberToGroupChat(
  chatId: string,
  userPrincipalName: string
): Promise<{ success: boolean; reason?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const token = await getAppOnlyToken();

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/chats/${chatId}/members`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          '@odata.type': '#microsoft.graph.aadUserConversationMember',
          'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${userPrincipalName}')`,
          roles: [],
        }),
        signal: controller.signal,
      }
    );

    if (res.ok) {
      return { success: true };
    }

    // 409 = already a member
    if (res.status === 409) {
      return { success: true, reason: 'already_member' };
    }

    const errText = await res.text().catch(() => '');
    return { success: false, reason: `Graph API error: ${res.status} ${errText}` };
  } catch (error) {
    return { success: false, reason: error instanceof Error ? error.message : 'Unknown error' };
  } finally {
    clearTimeout(timeoutId);
  }
}
