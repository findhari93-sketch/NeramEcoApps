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
 * Does an Entra user object exist for this id/UPN? Used to detect a stale stored
 * ms_oid (404) before falling back to an email lookup. Never throws.
 */
export async function userExists(idOrUpn: string): Promise<boolean> {
  if (!idOrUpn) return false;
  try {
    const res = await graphFetch(`/users/${encodeURIComponent(idOrUpn)}?$select=id`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Find a user's Entra object id (ms_oid) from their email/UPN. Microsoft is the
 * authority on email -> account, so this recovers the right account even when our
 * stored ms_oid is null, stale, or sitting on a duplicate record. Tries UPN, then
 * the primary `mail`, then any proxy address. Returns null if no match. Never throws.
 */
export async function findUserOidByEmail(email: string | null | undefined): Promise<string | null> {
  const e = (email || '').trim();
  if (!e || !e.includes('@')) return null;
  const esc = e.replace(/'/g, "''");
  // 1) Direct lookup (works when email === userPrincipalName).
  try {
    const r = await graphFetch(`/users/${encodeURIComponent(e)}?$select=id`);
    if (r.ok) {
      const d = await r.json();
      if (d?.id) return d.id as string;
    }
  } catch {
    /* fall through */
  }
  // 2) Filter by primary mail.
  try {
    const r = await graphFetch(`/users?$filter=mail eq '${esc}'&$select=id`);
    if (r.ok) {
      const d = await r.json();
      if (d?.value?.[0]?.id) return d.value[0].id as string;
    }
  } catch {
    /* fall through */
  }
  // 3) Match any proxy/alias address (needs the eventual-consistency header).
  try {
    const r = await graphFetch(
      `/users?$filter=proxyAddresses/any(p:p eq 'smtp:${esc}')&$select=id&$count=true`,
      { headers: { ConsistencyLevel: 'eventual' } },
    );
    if (r.ok) {
      const d = await r.json();
      if (d?.value?.[0]?.id) return d.value[0].id as string;
    }
  } catch {
    /* fall through */
  }
  return null;
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
      `/users/${encodeURIComponent(userId)}?$select=displayName,givenName,surname,mail,otherMails,userPrincipalName,mobilePhone,businessPhones,jobTitle,department,officeLocation,preferredLanguage,city,country`,
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Result of an app-only Graph photo read. The `status` on failure lets a caller
 * tell a genuine "no photo" (404) apart from a permission (401/403) or throttle
 * (429) problem, instead of collapsing them all to null. `status: 0` means a
 * network error / timeout (the request never got an HTTP response).
 */
export type UserPhotoResult =
  | { ok: true; buffer: Buffer; contentType: string }
  | { ok: false; status: number; retryAfterMs?: number };

/**
 * Fetch a Microsoft user's profile photo bytes with the failure status exposed.
 * App-only read access (User.Read.All) suffices. Never throws.
 *
 * NOTE: app-only `GET /users/{id}/photo/$value` returns 404 for a sizeable share
 * of users (e.g. no Exchange mailbox) even when the photo is readable via a
 * delegated token. The `status` split here is what lets a sync distinguish that
 * real limitation from a permission/throttle failure.
 */
export async function getUserPhotoResult(userId: string): Promise<UserPhotoResult> {
  try {
    const res = await graphFetch(`/users/${encodeURIComponent(userId)}/photo/$value`);
    if (!res.ok) {
      let retryAfterMs: number | undefined;
      if (res.status === 429) {
        const ra = parseInt(res.headers.get('retry-after') || '', 10);
        if (Number.isFinite(ra)) retryAfterMs = ra * 1000;
      }
      return { ok: false, status: res.status, retryAfterMs };
    }
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await res.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return { ok: false, status: 404 }; // 200 with empty body = treat as no photo
    }
    return { ok: true, buffer: Buffer.from(arrayBuffer), contentType };
  } catch {
    return { ok: false, status: 0 }; // network error / timeout
  }
}

/**
 * Fetch a Microsoft user's profile photo bytes. Returns null when there is no
 * photo (404) or on any error. App-only read access (User.Read.All) suffices.
 * Thin wrapper over {@link getUserPhotoResult} for callers that don't need the
 * failure status (offboarding capture, etc.).
 */
export async function getUserPhoto(
  userId: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const result = await getUserPhotoResult(userId);
  return result.ok ? { buffer: result.buffer, contentType: result.contentType } : null;
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
 * Result of syncing one student to a classroom's Team + the global group chat.
 * `team` / `groupChat` are null when that step was not applicable (no linked
 * team / no chat configured). `inviteLink` is the shareable group-chat link the
 * caller should surface, since app-only Graph generally cannot add to a chat.
 */
export interface ClassroomTeamsSyncResult {
  team: { success: boolean; reason?: string } | null;
  groupChat: { success: boolean; reason?: string } | null;
  inviteLink: string | null;
  /** true when there was no UPN/email to sync (Team/chat both skipped). */
  skipped: boolean;
}

/**
 * Add a student to (1) the classroom's linked Microsoft Team and (2) the global
 * student Teams group chat, in a single call. This dedupes the enroll-time block
 * that was copy-pasted across the admin enroll / sync-entra / reconcile routes.
 *
 * The Supabase client is PASSED IN (never imported) so @neram/auth stays free of
 * a @neram/database dependency. Reads:
 *   - nexus_classrooms.ms_team_id / ms_team_sync_enabled (Team link)
 *   - app_settings.teams_group_chat = { chat_id, invite_link, auto_add_enabled }
 *
 * Everything is best-effort and non-blocking (never throws):
 *   - Team add works app-only (TeamMember.ReadWrite.All).
 *   - Group-chat add (POST /chats/{id}/members) is generally BLOCKED for app-only
 *     tokens by Microsoft (403). It is attempted only when auto_add_enabled, and
 *     the invite_link is always returned as the real fallback mechanism.
 * Users with no UPN/email are skipped (returns { skipped: true }).
 */
export async function addStudentToClassroomTeams(
  client: any,
  opts: { classroomId: string; userId?: string | null; upn?: string | null; source?: string }
): Promise<ClassroomTeamsSyncResult> {
  const { classroomId, userId = null, upn, source = 'enroll' } = opts;
  const result: ClassroomTeamsSyncResult = { team: null, groupChat: null, inviteLink: null, skipped: false };

  const email = (upn || '').trim();
  if (!email) {
    result.skipped = true;
    return result;
  }

  // 1) Classroom's linked Team (only when a team is linked AND sync is enabled).
  try {
    const { data: classroom } = await client
      .from('nexus_classrooms')
      .select('ms_team_id, ms_team_sync_enabled, name')
      .eq('id', classroomId)
      .maybeSingle();

    if (classroom?.ms_team_id && classroom.ms_team_sync_enabled) {
      result.team = await addMemberToTeam(classroom.ms_team_id, email);
      // Best-effort audit trail; never let a logging failure break enrollment.
      try {
        await client.from('nexus_teams_sync_log').insert({
          classroom_id: classroomId,
          user_id: userId,
          action: 'add_member',
          status: result.team.success ? 'success' : 'failed',
          error_message: result.team.success ? null : result.team.reason,
          details: { source, classroom_name: classroom.name },
        });
      } catch {
        /* non-blocking */
      }
    }
  } catch (err) {
    result.team = { success: false, reason: err instanceof Error ? err.message : 'unknown_error' };
  }

  // 2) Global student group chat (best-effort; invite_link is the real path).
  try {
    const { data: chatSetting } = await client
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'teams_group_chat')
      .maybeSingle();

    const chatConfig = chatSetting?.setting_value;
    if (chatConfig?.invite_link) result.inviteLink = chatConfig.invite_link;
    if (chatConfig?.chat_id && chatConfig.auto_add_enabled) {
      result.groupChat = await addMemberToGroupChat(chatConfig.chat_id, email);
    }
  } catch (err) {
    result.groupChat = { success: false, reason: err instanceof Error ? err.message : 'unknown_error' };
  }

  // 3) Install the "Neram Assistant" Teams app in the student's personal scope so
  //    assignment/study reminders can reach their Teams Activity feed. Best-effort
  //    and no-op until TEAMS_APP_CATALOG_ID is configured. The reminder send path
  //    also lazily installs on demand, so this is just an optimization.
  const reminderAppId = process.env.TEAMS_APP_CATALOG_ID;
  if (reminderAppId) {
    await ensureTeamsAppInstalledForUser(email, reminderAppId);
  }

  return result;
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

// ============================================================
// Teams Activity-feed notifications ("Neram Assistant", app-only)
//
// Delivers a reminder to a user's Teams "Activity" feed (the bell) instead of a
// chat, so templated reminders never clutter a real 1:1 conversation. This is the
// clean-channel path the assignment reminders use.
//
// One-time admin setup this depends on:
//   - Application permission TeamsActivity.Send (admin consent) — to notify.
//   - Application permission TeamsAppInstallation.ReadWriteForUser.All (admin
//     consent) — to install the app in each student's personal scope, which is a
//     prerequisite for notifying them.
//   - A "Neram Assistant" Teams app uploaded to the org catalog whose
//     webApplicationInfo.id equals AZ_CLIENT_ID (so this app-only token is
//     authorized to notify on its behalf). Its catalog id is passed as
//     `catalogAppId` (env TEAMS_APP_CATALOG_ID).
//
// Everything is best-effort and never throws; callers fall back to in-app + email.
// ============================================================

export interface TeamsActivityResult {
  ok: boolean;
  /** HTTP status (0 = network error / not attempted). */
  status: number;
  reason?: string;
}

/**
 * Ensure the "Neram Assistant" Teams app is installed in a user's personal scope.
 * sendActivityNotification requires the app to be installed for the recipient, so
 * the sender calls this first (and retries the send once after a fresh install).
 * Returns { ok: true } when already installed or newly installed. Never throws.
 */
export async function ensureTeamsAppInstalledForUser(
  userMsOid: string,
  catalogAppId: string,
): Promise<{ ok: boolean; alreadyInstalled?: boolean; reason?: string }> {
  if (!userMsOid || !catalogAppId) return { ok: false, reason: 'missing_oid_or_app_id' };
  try {
    // Already installed? List personal-scope apps and match the catalog id in code
    // (filtering on an expanded nav property is unreliable across tenants).
    const listRes = await graphFetch(
      `/users/${encodeURIComponent(userMsOid)}/teamwork/installedApps?$expand=teamsApp`,
    );
    if (listRes.ok) {
      const data = await listRes.json().catch(() => null);
      const found =
        Array.isArray(data?.value) &&
        data.value.some(
          (a: any) => a?.teamsApp?.id === catalogAppId || a?.teamsApp?.externalId === catalogAppId,
        );
      if (found) return { ok: true, alreadyInstalled: true };
    }
    // Install it.
    const installRes = await graphFetch(
      `/users/${encodeURIComponent(userMsOid)}/teamwork/installedApps`,
      {
        method: 'POST',
        body: JSON.stringify({
          'teamsApp@odata.bind': `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/${catalogAppId}`,
        }),
      },
    );
    if (installRes.ok || installRes.status === 201) return { ok: true, alreadyInstalled: false };
    if (installRes.status === 409) return { ok: true, alreadyInstalled: true }; // race: already installed
    const errText = await installRes.text().catch(() => '');
    return { ok: false, reason: `install ${installRes.status}: ${errText}` };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'unknown_error' };
  }
}

/**
 * Send a Teams Activity-feed notification to a user (app-only). Lands in their
 * Teams "Activity" (bell), separate from all chats. `webUrl` deep-links the
 * notification (e.g. the Nexus assignment). Ensures the app is installed first and
 * retries once on a "not installed" (404/403) failure. Never throws.
 *
 * Uses the reserved `systemDefault` activity type, which needs no manifest
 * `activities` declaration; the free text goes in templateParameters.systemDefaultText.
 */
export async function sendTeamsActivityNotification(
  userMsOid: string,
  opts: { title: string; text: string; webUrl: string; catalogAppId: string },
): Promise<TeamsActivityResult> {
  if (!userMsOid || !opts.catalogAppId) return { ok: false, status: 0, reason: 'missing_oid_or_app_id' };

  const post = (): Promise<Response> =>
    graphFetch(`/users/${encodeURIComponent(userMsOid)}/teamwork/sendActivityNotification`, {
      method: 'POST',
      body: JSON.stringify({
        topic: { source: 'text', value: opts.title.slice(0, 150), webUrl: opts.webUrl },
        activityType: 'systemDefault',
        previewText: { content: opts.text.slice(0, 150) },
        teamsAppId: opts.catalogAppId,
        templateParameters: [{ name: 'systemDefaultText', value: opts.text.slice(0, 150) }],
      }),
    });

  try {
    let res = await post();
    // 404/403 usually means the app isn't installed for this user yet — install then retry once.
    if (!res.ok && (res.status === 404 || res.status === 403)) {
      const install = await ensureTeamsAppInstalledForUser(userMsOid, opts.catalogAppId);
      if (install.ok) res = await post();
    }
    if (res.ok || res.status === 204) return { ok: true, status: res.status };
    const errText = await res.text().catch(() => '');
    return { ok: false, status: res.status, reason: `sendActivityNotification ${res.status}: ${errText}` };
  } catch (error) {
    return { ok: false, status: 0, reason: error instanceof Error ? error.message : 'unknown_error' };
  }
}
