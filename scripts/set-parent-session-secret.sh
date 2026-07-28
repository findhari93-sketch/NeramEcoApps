#!/usr/bin/env bash
#
# Sets PARENT_SESSION_SECRET for the Nexus app.
#
# This is the ONE thing the parent portal needs that could not be automated:
# the Vercel CLI token on this machine has expired, and the Vercel MCP server
# exposes no environment-variable tooling (only deployments, logs and projects).
#
# The secret is generated locally and piped straight into Vercel, so it never
# passes through a chat transcript, a commit, or a log line.
#
# Run once:
#   vercel login          # only if `vercel whoami` fails
#   bash scripts/set-parent-session-secret.sh
#
# Until this runs, /api/auth/parent/login returns a clear 503 and the rest of
# Nexus is completely unaffected: the secret is only ever read when a `par_`
# token is minted or verified.

set -euo pipefail

cd "$(dirname "$0")/../apps/nexus"

if ! vercel whoami >/dev/null 2>&1; then
  echo "Not signed in to Vercel. Run 'vercel login' first, then re-run this script." >&2
  exit 1
fi

# 48 random bytes, base64url. Comfortably beyond what HMAC-SHA256 needs.
SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")"

echo "Adding PARENT_SESSION_SECRET to Vercel (production)..."
printf '%s' "$SECRET" | vercel env add PARENT_SESSION_SECRET production

echo "Adding PARENT_SESSION_SECRET to Vercel (preview)..."
printf '%s' "$SECRET" | vercel env add PARENT_SESSION_SECRET preview

# Local dev too, so the parent portal works with `pnpm dev:nexus`.
# Appended rather than rewritten, and only if it is not already there.
ENV_LOCAL=".env.local"
if [ -f "$ENV_LOCAL" ] && grep -q '^PARENT_SESSION_SECRET=' "$ENV_LOCAL"; then
  echo "PARENT_SESSION_SECRET already present in apps/nexus/.env.local, leaving it alone."
else
  printf '\nPARENT_SESSION_SECRET=%s\n' "$SECRET" >> "$ENV_LOCAL"
  echo "Added PARENT_SESSION_SECRET to apps/nexus/.env.local"
fi

echo
echo "Done. The next production deploy picks it up."
echo "To activate it without waiting for a code change, redeploy Nexus:"
echo "  gh workflow run deploy.yml -r main -f environment=production"
