-- The channel-owner OAuth grant that lets the backup cron upload to YouTube.
--
-- NOT nexus_settings, which is where this obviously belonged: GET /api/settings
-- takes a `key` query parameter and returns that key's value with NO
-- authentication at all (see apps/nexus/src/app/api/settings/route.ts, the GET
-- handler never calls verifyMsToken). A refresh token in that table is a
-- published refresh token, readable by anyone who guesses the key.
--
-- NOT an env var either. A Vercel env change needs a redeploy to reach running
-- functions, and a refresh token is exactly the credential that dies at the
-- worst moment: consent withdrawn, the Google account's password changed, more
-- than 50 outstanding tokens issued for the client, or the OAuth app slipping
-- back to "Testing" (which expires refresh tokens after 7 days). Recovery has to
-- be an admin clicking Reconnect, not a code change and a deploy.
--
-- One logical row. `channel_key` exists so that a second channel later is a row,
-- not a schema change.

CREATE TABLE IF NOT EXISTS nexus_youtube_credentials (
  channel_key              TEXT PRIMARY KEY DEFAULT 'default',
  refresh_token            TEXT NOT NULL,

  -- Cached so consecutive cron runs inside one hour skip the token exchange,
  -- mirroring the in-process cache in lib/graph-app-token.
  access_token             TEXT,
  access_token_expires_at  TIMESTAMPTZ,
  scope                    TEXT,

  -- Consenting with the wrong Google account is the likeliest setup mistake and
  -- it fails silently: class recordings would upload to somebody's personal
  -- channel and nothing would look broken. Stored so the admin page can show
  -- WHICH channel is connected before anyone trusts it.
  youtube_channel_id       TEXT,
  youtube_channel_title    TEXT,

  connected_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  connected_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Set on invalid_grant so the cron can report 'oauth_revoked' and stop,
  -- WITHOUT burning any class's attempt cap on a failure that is not the
  -- class's fault, and so the admin page can show Reconnect.
  revoked_at               TIMESTAMPTZ,
  last_error               TEXT,

  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE nexus_youtube_credentials IS
  'The Google OAuth grant used to upload class recordings. Deliberately not in nexus_settings, whose GET endpoint is unauthenticated.';
COMMENT ON COLUMN nexus_youtube_credentials.refresh_token IS
  'Long-lived Google refresh token. Does not expire while the OAuth consent screen is published "In production"; a Testing-mode app expires it after 7 days, which presents as the backup silently stopping a week after setup.';
COMMENT ON COLUMN nexus_youtube_credentials.access_token IS
  'Short-lived token cached across cron invocations. Refreshed when access_token_expires_at is within a 5 minute skew.';
COMMENT ON COLUMN nexus_youtube_credentials.youtube_channel_id IS
  'Captured at consent from channels?mine=true. Guards against the silent failure of having authorised the wrong Google account.';
COMMENT ON COLUMN nexus_youtube_credentials.revoked_at IS
  'Set when Google answers invalid_grant. While set, the cron reports oauth_revoked and touches no class attempt counters.';

-- Authorization is enforced in the API layer with the service-role client.
ALTER TABLE nexus_youtube_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_youtube_credentials" ON nexus_youtube_credentials;
CREATE POLICY "service_role_full_access_youtube_credentials"
  ON nexus_youtube_credentials FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Shared trigger function, declared back in 002_application_form_enhancements.
DROP TRIGGER IF EXISTS update_nexus_youtube_credentials_updated_at ON nexus_youtube_credentials;
CREATE TRIGGER update_nexus_youtube_credentials_updated_at
  BEFORE UPDATE ON nexus_youtube_credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
