/**
 * One-time: mint the Google Ads refresh token for the Marketing Intelligence agent.
 *
 *   cd scripts
 *   npx tsx google-ads-auth.ts --write-env ../apps/admin/.env.local
 *
 * 1. In a Google Cloud project with the Google Ads API enabled and Explorer (or
 *    Basic) access granted, create a Desktop OAuth client (APIs & Services >
 *    Credentials). Since 2026-09-09 access belongs to the Cloud project; there is
 *    no developer token to request.
 * 2. Put GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET in the env file (or
 *    the environment). With --write-env they are read from that file.
 * 3. Run this, sign in as the Google user who runs Neram's ads, and allow access.
 * 4. With --write-env, GOOGLE_ADS_REFRESH_TOKEN (and GOOGLE_ADS_CUSTOMER_ID, when
 *    the user reaches exactly one ad account) are written into that file and
 *    never printed. Without it, the token is printed once.
 * 5. It lists the ad accounts the user can reach, so you can pick
 *    GOOGLE_ADS_CUSTOMER_ID (and GOOGLE_ADS_LOGIN_CUSTOMER_ID if you go through
 *    a manager account).
 *
 * Re-run if the agent reports `invalid_grant` (the token was revoked, or the
 * OAuth consent screen is still in Testing, where refresh tokens expire after
 * 7 days: publish it to Production to stop that).
 *
 * See docs/marketing-intelligence/README.md.
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';

const PORT = 3334;
const SCOPE = 'https://www.googleapis.com/auth/adwords';

function readEnvFile(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

/** Set KEY=value in an env file, replacing an existing line or appending one. */
function setEnv(file: string, key: string, value: string) {
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const line = `${key}=${value}`;
  const re = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');
  const next = re.test(text) ? text.replace(re, line) : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`;
  fs.writeFileSync(file, next);
}

async function main() {
  const i = process.argv.indexOf('--write-env');
  const envFile = i > -1 ? process.argv[i + 1] : null;
  const fileEnv = envFile ? readEnvFile(envFile) : {};
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID || fileEnv.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET || fileEnv.GOOGLE_ADS_CLIENT_SECRET;
  const apiVersion = process.env.GOOGLE_ADS_API_VERSION || fileEnv.GOOGLE_ADS_API_VERSION || 'v25';
  if (!clientId || !clientSecret) {
    console.error(`Set GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET first${envFile ? ` (in ${envFile})` : ''}.`);
    process.exit(1);
  }

  // Plain OAuth 2.0 over fetch, so the script needs no Google SDK installed.
  const redirectUri = `http://localhost:${PORT}`;
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  })}`;
  console.log('\nOpen this URL, sign in with the Google account that runs Neram ads, and allow access:\n');
  console.log(authUrl, '\n');
  // Open the browser with the platform's own opener; the URL above works if it does not.
  // On Windows, rundll32 and "start" cut the URL at the first "&"; PowerShell's Start-Process keeps it whole.
  const [cmd, args] =
    process.platform === 'win32'
      ? ['powershell', ['-NoProfile', '-Command', `Start-Process '${authUrl}'`]]
      : process.platform === 'darwin'
        ? ['open', [authUrl]]
        : ['xdg-open', [authUrl]];
  spawn(cmd, args as string[], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const params = new URL(req.url || '/', redirectUri).searchParams;
      const q = { code: params.get('code'), error: params.get('error') };
      if (q.code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Done</h1><p>You can close this tab and return to the terminal.</p>');
        server.close();
        resolve(q.code);
      } else {
        res.writeHead(400);
        res.end(String(q.error || 'No code'));
        server.close();
        reject(new Error(String(q.error || 'No authorization code')));
      }
    });
    server.listen(PORT, () => console.log(`Waiting on http://localhost:${PORT} ...`));
    setTimeout(() => {
      server.close();
      reject(new Error('Timed out after 10 minutes'));
    }, 600_000);
  });

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  });
  const tokens: { refresh_token?: string; access_token?: string; error?: string; error_description?: string } = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok) {
    console.error(`Google refused the sign-in code: ${tokens.error_description ?? tokens.error ?? tokenRes.status}`);
    process.exit(1);
  }
  if (!tokens.refresh_token) {
    console.error('Google returned no refresh token. Remove the app at https://myaccount.google.com/permissions and run this again.');
    process.exit(1);
  }
  if (envFile) {
    setEnv(envFile, 'GOOGLE_ADS_REFRESH_TOKEN', tokens.refresh_token);
    console.log(`\nGOOGLE_ADS_REFRESH_TOKEN written to ${envFile} (not shown).`);
  } else {
    console.log('\nGOOGLE_ADS_REFRESH_TOKEN (shown once, store it in Vercel, never in git):\n');
    console.log(tokens.refresh_token, '\n');
  }

  if (tokens.access_token) {
    const headers: Record<string, string> = { Authorization: `Bearer ${tokens.access_token}` };
    // Optional since 2026-09-09; sent only for an old token.
    if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN) headers['developer-token'] = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const res = await fetch(`https://googleads.googleapis.com/${apiVersion}/customers:listAccessibleCustomers`, { headers });
    const body: any = await res.json().catch(() => ({}));
    if (res.ok) {
      const ids: string[] = (body.resourceNames ?? []).map((r: string) => String(r).replace('customers/', ''));
      console.log('\nAd accounts this user can reach:', ids.length ? ids.join(', ') : 'none');
      if (envFile && ids.length === 1 && !fileEnv.GOOGLE_ADS_CUSTOMER_ID) {
        setEnv(envFile, 'GOOGLE_ADS_CUSTOMER_ID', ids[0]);
        console.log(`GOOGLE_ADS_CUSTOMER_ID=${ids[0]} written to ${envFile}.`);
      } else if (ids.length > 1) {
        console.log('More than one: set GOOGLE_ADS_CUSTOMER_ID to the Neram Classrooms account (and GOOGLE_ADS_LOGIN_CUSTOMER_ID to the manager account, if it is listed).');
      }
    } else {
      console.log(`\nCould not list accounts (${res.status}): ${body?.error?.message ?? 'unknown error'}. If it says CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION, apply for Explorer access on the Google Ads API page of the Cloud project.`);
    }
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
