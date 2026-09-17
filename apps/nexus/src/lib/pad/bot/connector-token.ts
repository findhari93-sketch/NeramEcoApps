/**
 * The bot's own token for calling the Bot Framework connector, which is how the
 * "Question is open" notification reaches students in a meeting.
 *
 * Client credentials on the bot's Entra app with the connector scope, following
 * Microsoft's "Authenticate requests from your bot to the Bot Connector service".
 * Cached until five minutes before it expires; a failed request is never cached.
 *
 * Config: PAD_BOT_APP_ID and PAD_BOT_APP_SECRET, falling back to AZ_CLIENT_ID and
 * AZ_CLIENT_SECRET; PAD_BOT_TENANT_ID, falling back to AZ_TENANT_ID, for a
 * single-tenant bot. A multi-tenant bot sets PAD_BOT_TENANT_ID=botframework.com.
 */

const CONNECTOR_SCOPE = 'https://api.botframework.com/.default';
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const DEFAULT_LIFETIME_SECONDS = 3600;

/** The message is for server logs. It never contains the secret. */
export class ConnectorTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectorTokenError';
  }
}

export interface ConnectorCredentials {
  appId: string;
  secret: string;
  tenant: string;
}

export function connectorCredentials(): ConnectorCredentials | null {
  const appId = (process.env.PAD_BOT_APP_ID || process.env.AZ_CLIENT_ID || '').trim();
  const secret = process.env.PAD_BOT_APP_SECRET || process.env.AZ_CLIENT_SECRET || '';
  const tenant = (process.env.PAD_BOT_TENANT_ID || process.env.AZ_TENANT_ID || '').trim();
  return appId && secret && tenant ? { appId, secret, tenant } : null;
}

let cached: { token: string; expiresAt: number } | null = null;
let pending: Promise<string> | null = null;

/** Test seam. Forgets the cached token. */
export function __resetConnectorToken(): void {
  cached = null;
  pending = null;
}

async function requestToken(credentials: ConnectorCredentials): Promise<string> {
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(credentials.tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: credentials.appId,
      client_secret: credentials.secret,
      scope: CONNECTOR_SCOPE,
    }).toString(),
  });
  if (!response.ok) throw new ConnectorTokenError(`Connector token refused: ${response.status}`);

  const body = (await response.json().catch(() => ({}))) as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== 'string' || !body.access_token) throw new ConnectorTokenError('Connector token missing');

  const lifetime = Number(body.expires_in) > 0 ? Number(body.expires_in) : DEFAULT_LIFETIME_SECONDS;
  cached = { token: body.access_token, expiresAt: Date.now() + lifetime * 1000 };
  return body.access_token;
}

export async function connectorToken(credentials: ConnectorCredentials | null = connectorCredentials()): Promise<string> {
  if (!credentials) throw new ConnectorTokenError('Bot credentials are not configured');
  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) return cached.token;
  if (!pending) {
    pending = requestToken(credentials).finally(() => {
      pending = null;
    });
  }
  return pending;
}
