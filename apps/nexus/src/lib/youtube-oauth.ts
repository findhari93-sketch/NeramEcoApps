/**
 * The Google grant the backup cron uploads with.
 *
 * A separate OAuth client from the one apps/app and apps/marketing use for the
 * student subscription check. That one is consented by students on a different
 * redirect URI with a read-only scope; adding youtube.upload to its consent
 * screen would show every student "upload videos to your YouTube account".
 *
 * The refresh token lives in nexus_youtube_credentials rather than nexus_settings
 * because GET /api/settings is unauthenticated and would serve it to anyone, and
 * rather than an env var because re-keying a revoked token has to be a button,
 * not a redeploy. See the migration for the full argument.
 */

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

/**
 * youtube.upload does the work. youtube.readonly is what lets the promotion pass
 * read a video's live privacy status for 1 quota unit, which is how the cron
 * learns the teacher has flipped it to unlisted without anyone telling it.
 */
export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

/** Refresh a little early: a token that expires mid-upload wastes a chunk. */
const EXPIRY_SKEW_SECONDS = 300;

export interface YouTubeCredentialsRow {
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  revoked_at: string | null;
  youtube_channel_id: string | null;
  youtube_channel_title: string | null;
  scope: string | null;
}

function clientConfig() {
  const clientId = process.env.YOUTUBE_UPLOAD_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_UPLOAD_CLIENT_SECRET;
  const redirectUri = process.env.YOUTUBE_UPLOAD_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'YOUTUBE_UPLOAD_CLIENT_ID, YOUTUBE_UPLOAD_CLIENT_SECRET and YOUTUBE_UPLOAD_REDIRECT_URI must be set',
    );
  }
  return { clientId, clientSecret, redirectUri };
}

/**
 * Where the admin is sent to consent.
 *
 * access_type=offline is what makes Google return a refresh token at all.
 * prompt=consent forces a NEW one even when this account has already granted the
 * scope; without it a second consent returns no refresh_token and the only way
 * to re-key would be revoking the grant by hand at myaccount.google.com.
 */
export function buildConsentUrl(state: string): string {
  const { clientId, redirectUri } = clientConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: YOUTUBE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export function isTokenExpired(expiresAt: string | null, skewSeconds = EXPIRY_SKEW_SECONDS): boolean {
  if (!expiresAt) return true;
  const ms = new Date(expiresAt).getTime();
  if (!Number.isFinite(ms)) return true;
  return ms - skewSeconds * 1000 <= Date.now();
}

export interface TokenExchange {
  accessToken: string;
  refreshToken?: string;
  scope: string;
  expiresAt: string;
}

async function postToken(
  body: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<TokenExchange> {
  const res = await fetchImpl(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    // invalid_grant is the one that matters: the refresh token is dead, usually
    // because consent was withdrawn or the OAuth app is still in Testing mode,
    // where Google expires refresh tokens after 7 days.
    const err = json?.error || `token ${res.status}`;
    throw new Error(err === 'invalid_grant' ? 'invalid_grant' : String(err));
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    scope: json.scope || '',
    expiresAt: new Date(Date.now() + Number(json.expires_in || 3600) * 1000).toISOString(),
  };
}

/** Trade the one-time code from the callback for a refresh token. */
export async function exchangeCode(
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenExchange> {
  const { clientId, clientSecret, redirectUri } = clientConfig();
  return postToken(
    {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    },
    fetchImpl,
  );
}

export async function refreshAccessToken(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenExchange> {
  const { clientId, clientSecret } = clientConfig();
  return postToken(
    {
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    },
    fetchImpl,
  );
}

/** Which channel was actually consented. Costs 1 quota unit. */
export async function fetchChannel(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; title: string } | null> {
  const res = await fetchImpl(
    'https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return null;
  const json = await res.json().catch(() => ({}));
  const item = json?.items?.[0];
  return item ? { id: item.id, title: item.snippet?.title || '' } : null;
}

export class YouTubeAuthError extends Error {
  constructor(
    message: string,
    /** True when the grant is dead and no retry will help. */
    readonly revoked: boolean,
  ) {
    super(message);
    this.name = 'YouTubeAuthError';
  }
}

/**
 * A usable access token, refreshing only when the cached one is stale.
 *
 * Two layers, mirroring lib/graph-app-token: the row caches across invocations
 * so three cron runs in one night share a single exchange, and the callers
 * inside a run share the row read.
 *
 * On invalid_grant this marks the credential revoked and throws with
 * revoked=true, which the sweep turns into a run-level stop that touches no
 * class's attempt counter. A dead grant is not any class's fault, and letting it
 * burn attempt caps would quietly retire classes from the backup queue while an
 * admin was still fixing the connection.
 */
export async function getUploadAccessToken(
  supabase: any,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const { data: row, error } = await supabase
    .from('nexus_youtube_credentials')
    .select('refresh_token, access_token, access_token_expires_at, revoked_at')
    .eq('channel_key', 'default')
    .maybeSingle();

  if (error) throw new YouTubeAuthError(`credentials read failed: ${error.message}`, false);
  if (!row) throw new YouTubeAuthError('YouTube is not connected', true);
  if (row.revoked_at) throw new YouTubeAuthError('The YouTube connection was revoked', true);

  if (row.access_token && !isTokenExpired(row.access_token_expires_at)) {
    return row.access_token;
  }

  try {
    const fresh = await refreshAccessToken(row.refresh_token, fetchImpl);
    await supabase
      .from('nexus_youtube_credentials')
      .update({
        access_token: fresh.accessToken,
        access_token_expires_at: fresh.expiresAt,
        last_error: null,
      })
      .eq('channel_key', 'default');
    return fresh.accessToken;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'refresh failed';
    const revoked = message === 'invalid_grant';
    if (revoked) {
      await supabase
        .from('nexus_youtube_credentials')
        .update({ revoked_at: new Date().toISOString(), last_error: message })
        .eq('channel_key', 'default');
    }
    throw new YouTubeAuthError(message, revoked);
  }
}
