#!/usr/bin/env bash
# One-off: replace WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN across
# admin / app / marketing / nexus, on production AND preview.
#
# Usage (from project root):
#   bash scripts/update-vercel-whatsapp-envs.sh "<NEW_PHONE_NUMBER_ID>" "<NEW_ACCESS_TOKEN>"

set -u

PHONE_ID="${1:-}"
TOKEN="${2:-}"

if [ -z "$PHONE_ID" ] || [ -z "$TOKEN" ]; then
  echo "Usage: $0 <PHONE_NUMBER_ID> <ACCESS_TOKEN>"
  exit 1
fi

APPS=(admin app marketing nexus)
ENVS=(production preview)
VARS=("WHATSAPP_PHONE_NUMBER_ID:$PHONE_ID" "WHATSAPP_ACCESS_TOKEN:$TOKEN")

for app in "${APPS[@]}"; do
  echo
  echo "=========================================="
  echo "  apps/$app"
  echo "=========================================="
  cd "apps/$app" || { echo "  ! cannot cd apps/$app, skipping"; continue; }

  for env in "${ENVS[@]}"; do
    for entry in "${VARS[@]}"; do
      key="${entry%%:*}"
      val="${entry#*:}"
      echo "  -> $env $key"
      # Remove existing (ignore failure if not present)
      vercel env rm "$key" "$env" --yes >/dev/null 2>&1 || true
      # Add new
      printf '%s' "$val" | vercel env add "$key" "$env" >/dev/null 2>&1 \
        && echo "     ok" \
        || echo "     FAILED (check vercel auth + project link)"
    done
  done

  cd ../..
done

echo
echo "Done. Verify with:  cd apps/admin && vercel env ls production | grep WHATSAPP"
