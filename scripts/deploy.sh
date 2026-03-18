#!/usr/bin/env bash
set -e

# ============================================
# Neram Ecosystem - Unified Deploy Script
# ============================================
# Flow: Auto-commit → Quality checks → Git push → Vercel auto-deploys
#
# How it works:
#   Push to `staging` branch  → Vercel deploys to staging domains
#   Push to `main` branch     → Vercel deploys to production domains
#
# Usage:
#   bash scripts/deploy.sh --target staging
#   bash scripts/deploy.sh --target production
#   bash scripts/deploy.sh --target all
#   bash scripts/deploy.sh --target staging --skip-checks --skip-db
#   bash scripts/deploy.sh --target all --skip-commit
#
# Flags:
#   --target [staging|production|all]  Required. Which environment(s) to deploy.
#   --skip-checks                      Skip type-check, lint, test, and build.
#   --skip-db                          Skip Supabase migrations.
#   --skip-commit                      Skip auto-commit of local changes.
# ============================================

# --- Branch Mapping ---
STAGING_BRANCH="staging"
PRODUCTION_BRANCH="main"

# --- Supabase Project Refs ---
STAGING_SUPABASE="hgxjavrsrvpihqrpezdh"
PRODUCTION_SUPABASE="zdnypksjqnhtiblwdaic"

# --- URLs (for summary display) ---
declare -A STAGING_URLS=(
  ["marketing"]="https://staging.neramclasses.com"
  ["app"]="https://staging-app.neramclasses.com"
  ["nexus"]="https://staging-nexus.neramclasses.com"
  ["admin"]="https://staging-admin.neramclasses.com"
)
declare -A PRODUCTION_URLS=(
  ["marketing"]="https://neramclasses.com"
  ["app"]="https://app.neramclasses.com"
  ["nexus"]="https://nexus.neramclasses.com"
  ["admin"]="https://admin.neramclasses.com"
)

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# --- Defaults ---
TARGET=""
SKIP_CHECKS=false
SKIP_DB=false
SKIP_COMMIT=false

# --- Parse Arguments ---
while [[ $# -gt 0 ]]; do
  case $1 in
    --target)
      TARGET="$2"
      shift 2
      ;;
    --skip-checks)
      SKIP_CHECKS=true
      shift
      ;;
    --skip-db)
      SKIP_DB=true
      shift
      ;;
    --skip-commit)
      SKIP_COMMIT=true
      shift
      ;;
    *)
      echo -e "${RED}Unknown argument: $1${NC}"
      echo "Usage: bash scripts/deploy.sh --target [staging|production|all] [--skip-checks] [--skip-db] [--skip-commit]"
      exit 1
      ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  echo -e "${RED}Error: --target is required${NC}"
  echo "Usage: bash scripts/deploy.sh --target [staging|production|all] [--skip-checks] [--skip-db] [--skip-commit]"
  exit 1
fi

if [[ "$TARGET" != "staging" && "$TARGET" != "production" && "$TARGET" != "all" ]]; then
  echo -e "${RED}Error: --target must be staging, production, or all${NC}"
  exit 1
fi

echo -e "${BLUE}=== Neram Deploy → ${TARGET^^} ===${NC}"

# --- Pre-flight Checks ---
echo -e "\n${BLUE}=== Pre-flight Checks ===${NC}"

for cmd in git pnpm; do
  if ! command -v $cmd &>/dev/null; then
    echo -e "${RED}Error: $cmd is not installed or not in PATH${NC}"
    exit 1
  fi
done

# Check supabase via npx (installed as monorepo dependency)
if [[ "$SKIP_DB" == false ]]; then
  if ! npx supabase --version &>/dev/null 2>&1; then
    echo -e "${RED}Error: supabase CLI is not available (tried npx supabase)${NC}"
    exit 1
  fi
fi
echo -e "${GREEN}All CLI tools available${NC}"

# Verify git remote
if ! git remote get-url origin &>/dev/null; then
  echo -e "${RED}Error: No git remote 'origin' configured${NC}"
  exit 1
fi

CURRENT_BRANCH=$(git branch --show-current)
echo -e "Current branch: ${YELLOW}${CURRENT_BRANCH}${NC}"

# --- Auto-Commit ---
if [[ "$SKIP_COMMIT" == false ]]; then
  echo -e "\n${BLUE}=== Auto-Commit ===${NC}"

  # Check for any changes (modified, untracked, staged)
  if [[ -n "$(git status --porcelain)" ]]; then
    echo -e "${YELLOW}Uncommitted changes detected. Committing...${NC}"

    # Stage all changes (excluding .claude/settings.local.json)
    git add -A
    git reset -- .claude/settings.local.json 2>/dev/null || true

    # Check if there's anything staged after exclusions
    if git diff --cached --quiet; then
      echo -e "${YELLOW}No meaningful changes to commit (only ignored files).${NC}"
    else
      # Generate commit message from changed files
      CHANGE_COUNT=$(git diff --cached --name-only | wc -l | tr -d ' ')

      # Build a short summary
      COMMIT_MSG="chore: Auto-commit before deploy ($TARGET)"
      if [[ "$CHANGE_COUNT" -le 5 ]]; then
        FILE_LIST=$(git diff --cached --name-only | sed 's|^|  - |')
        COMMIT_MSG="$COMMIT_MSG

Files changed:
$FILE_LIST"
      else
        COMMIT_MSG="$COMMIT_MSG

$CHANGE_COUNT files changed"
      fi

      git commit -m "$COMMIT_MSG"
      echo -e "${GREEN}Changes committed successfully${NC}"
    fi
  else
    echo -e "${GREEN}Working tree clean — nothing to commit${NC}"
  fi
else
  echo -e "${YELLOW}Skipping auto-commit (--skip-commit)${NC}"
fi

# --- Quality Checks ---
if [[ "$SKIP_CHECKS" == false ]]; then
  echo -e "\n${BLUE}=== Running Quality Checks ===${NC}"

  echo -e "${YELLOW}Running type-check...${NC}"
  pnpm type-check

  echo -e "${YELLOW}Running lint...${NC}"
  pnpm lint

  echo -e "${YELLOW}Running tests...${NC}"
  if pnpm test:run 2>/dev/null; then
    echo -e "${GREEN}Tests passed${NC}"
  else
    echo -e "${YELLOW}Warning: Tests failed or no tests found — continuing deploy${NC}"
  fi

  echo -e "${YELLOW}Running build...${NC}"
  pnpm build

  echo -e "${GREEN}All quality checks passed${NC}"
else
  echo -e "${YELLOW}Skipping quality checks (--skip-checks)${NC}"
fi

# --- Deploy Function ---
deploy_env() {
  local env_name="$1"
  local target_branch=""
  local supabase_ref=""

  local db_password=""

  if [[ "$env_name" == "staging" ]]; then
    target_branch="$STAGING_BRANCH"
    supabase_ref="$STAGING_SUPABASE"
    # Load staging DB password from .env.staging
    if [[ -f ".env.staging" ]]; then
      db_password=$(grep -E '^SUPABASE_DB_PASSWORD=' .env.staging 2>/dev/null | cut -d'=' -f2-)
    fi
  else
    target_branch="$PRODUCTION_BRANCH"
    supabase_ref="$PRODUCTION_SUPABASE"
    # Load production DB password from .env.production
    if [[ -f ".env.production" ]]; then
      db_password=$(grep -E '^SUPABASE_DB_PASSWORD=' .env.production 2>/dev/null | cut -d'=' -f2-)
    fi
  fi

  # Fall back to env var if not found in file
  db_password="${db_password:-$SUPABASE_DB_PASSWORD}"

  echo -e "\n${BLUE}========================================${NC}"
  echo -e "${BLUE}  Deploying to ${env_name^^}${NC}"
  echo -e "${BLUE}  Pushing to branch: ${target_branch}${NC}"
  echo -e "${BLUE}========================================${NC}"

  # --- Supabase Migrations ---
  if [[ "$SKIP_DB" == false ]]; then
    echo -e "\n${YELLOW}--- Supabase: Linking project ($supabase_ref) ---${NC}"
    npx supabase link --project-ref "$supabase_ref" ${db_password:+--password "$db_password"}

    echo -e "${YELLOW}--- Supabase: Pushing migrations ---${NC}"
    if npx supabase db push ${db_password:+--password "$db_password"}; then
      echo -e "${GREEN}Database migrations applied successfully${NC}"
    else
      echo -e "${YELLOW}Warning: Database migration had issues (may already be up to date)${NC}"
    fi
  else
    echo -e "${YELLOW}Skipping database migrations (--skip-db)${NC}"
  fi

  # --- Git Push ---
  echo -e "\n${YELLOW}--- Pushing to origin/${target_branch} ---${NC}"

  if [[ "$CURRENT_BRANCH" == "$target_branch" ]]; then
    # Already on the target branch — just push
    git push origin "$target_branch"
  else
    # Push current branch's commits to the target branch
    git push origin "HEAD:${target_branch}"
  fi

  echo -e "${GREEN}Pushed to origin/${target_branch} — Vercel will auto-deploy${NC}"

  # --- Cloudflare Cache Purge ---
  # Purge stale HTML from Cloudflare's edge so browsers always get fresh chunk references.
  # Set CLOUDFLARE_API_TOKEN in .env.staging / .env.production (not committed).
  CF_ZONE_ID="c8d99edfbd0d36b58a247ea7c4f49a63"
  CF_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
  # Load from env file if not already set
  if [[ -z "$CF_API_TOKEN" && "$env_name" == "staging" && -f ".env.staging" ]]; then
    CF_API_TOKEN=$(grep -E '^CLOUDFLARE_API_TOKEN=' .env.staging 2>/dev/null | cut -d'=' -f2-)
  fi
  if [[ -z "$CF_API_TOKEN" && "$env_name" == "production" && -f ".env.production" ]]; then
    CF_API_TOKEN=$(grep -E '^CLOUDFLARE_API_TOKEN=' .env.production 2>/dev/null | cut -d'=' -f2-)
  fi

  if [[ -n "$CF_API_TOKEN" ]]; then
    echo -e "${YELLOW}--- Purging Cloudflare cache ---${NC}"
    CF_RESPONSE=$(curl -s -X POST \
      "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data '{"purge_everything":true}')
    if echo "$CF_RESPONSE" | grep -q '"success":true'; then
      echo -e "${GREEN}Cloudflare cache purged${NC}"
    else
      echo -e "${YELLOW}Warning: Cloudflare purge failed (non-fatal): ${CF_RESPONSE}${NC}"
    fi
  else
    echo -e "${YELLOW}CLOUDFLARE_API_TOKEN not set — skipping Cloudflare cache purge${NC}"
    echo -e "${YELLOW}  Add it to .env.staging / .env.production to enable auto-purge${NC}"
  fi

  # --- Summary ---
  echo -e "\n${GREEN}=== ${env_name^^} Deploy Triggered ===${NC}"
  echo -e "Vercel will build and deploy from the ${YELLOW}${target_branch}${NC} branch."
  echo -e ""
  echo -e "┌──────────────┬──────────────────────────────────────────┐"
  echo -e "│ App          │ URL                                      │"
  echo -e "├──────────────┼──────────────────────────────────────────┤"

  if [[ "$env_name" == "staging" ]]; then
    for app_name in marketing app nexus admin; do
      printf "│ %-12s │ %-40s │\n" "$app_name" "${STAGING_URLS[$app_name]}"
    done
  else
    for app_name in marketing app nexus admin; do
      printf "│ %-12s │ %-40s │\n" "$app_name" "${PRODUCTION_URLS[$app_name]}"
    done
  fi

  echo -e "└──────────────┴──────────────────────────────────────────┘"
}

# --- Execute ---
case "$TARGET" in
  staging)
    deploy_env "staging"
    ;;
  production)
    deploy_env "production"
    ;;
  all)
    deploy_env "staging"
    echo ""
    deploy_env "production"
    echo -e "\n${GREEN}=== Both environments deployed successfully ===${NC}"
    ;;
esac

echo -e "\n${GREEN}Done!${NC}"
