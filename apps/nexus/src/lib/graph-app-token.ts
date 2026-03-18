/**
 * Shared app-only (client credentials) token for Microsoft Graph API.
 *
 * Used by: sharepoint.ts, teams-sync.ts
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
