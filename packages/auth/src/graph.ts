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
          roles: ['member'],
        }),
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
  }
}
