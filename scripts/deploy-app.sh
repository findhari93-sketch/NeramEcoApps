#!/usr/bin/env bash
set -e

# ============================================
# Neram Ecosystem - Per-App Deploy Script
# ============================================
# Deploys a single app using Vercel CLI (bypasses git-push-all).
#
# Usage:
#   bash scripts/deploy-app.sh --app nexus --target staging
#   bash scripts/deploy-app.sh --app marketing --target production
#   bash scripts/deploy-app.sh --app nexus --target staging --skip-checks
#
# Apps: marketing, app, nexus, admin
# Targets: staging, production
# ============================================

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# --- Defaults ---
APP=""
TARGET=""
SKIP_CHECKS=false

# --- App → Turbo filter mapping ---
declare -A APP_FILTERS=(
  ["marketing"]="@neram/marketing"
  ["app"]="@neram/tools-app"
  ["nexus"]="@neram/nexus"
  ["admin"]="@neram/admin"
)

# --- URLs ---
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

# --- Parse Arguments ---
while [[ $# -gt 0 ]]; do
  case $1 in
    --app)
      APP="$2"
      shift 2
      ;;
    --target)
      TARGET="$2"
      shift 2
      ;;
    --skip-checks)
      SKIP_CHECKS=true
      shift
      ;;
    *)
      echo -e "${RED}Unknown argument: $1${NC}"
      echo "Usage: bash scripts/deploy-app.sh --app [marketing|app|nexus|admin] --target [staging|production] [--skip-checks]"
      exit 1
      ;;
  esac
done

# --- Validate ---
if [[ -z "$APP" || -z "$TARGET" ]]; then
  echo -e "${RED}Error: --app and --target are required${NC}"
  echo "Usage: bash scripts/deploy-app.sh --app [marketing|app|nexus|admin] --target [staging|production] [--skip-checks]"
  exit 1
fi

if [[ -z "${APP_FILTERS[$APP]}" ]]; then
  echo -e "${RED}Error: Unknown app '$APP'. Must be: marketing, app, nexus, admin${NC}"
  exit 1
fi

if [[ "$TARGET" != "staging" && "$TARGET" != "production" ]]; then
  echo -e "${RED}Error: --target must be staging or production${NC}"
  exit 1
fi

APP_DIR="apps/$APP"
TURBO_FILTER="${APP_FILTERS[$APP]}"

echo -e "${BLUE}=== Deploy ${APP^^} → ${TARGET^^} ===${NC}"

# --- Pre-flight ---
if ! command -v vercel &>/dev/null; then
  echo -e "${RED}Error: vercel CLI not found. Run: pnpm add -g vercel${NC}"
  exit 1
fi

if [[ ! -d "$APP_DIR" ]]; then
  echo -e "${RED}Error: App directory '$APP_DIR' not found${NC}"
  exit 1
fi

# --- Quality Checks (only for the target app) ---
if [[ "$SKIP_CHECKS" == false ]]; then
  echo -e "\n${BLUE}=== Running Quality Checks for ${APP} ===${NC}"

  echo -e "${YELLOW}Type-checking ${APP}...${NC}"
  pnpm turbo run type-check --filter="$TURBO_FILTER"

  echo -e "${YELLOW}Linting ${APP}...${NC}"
  pnpm turbo run lint --filter="$TURBO_FILTER"

  echo -e "${YELLOW}Building ${APP}...${NC}"
  pnpm turbo run build --filter="$TURBO_FILTER"

  echo -e "${GREEN}Quality checks passed for ${APP}${NC}"
else
  echo -e "${YELLOW}Skipping quality checks (--skip-checks)${NC}"
fi

# --- Deploy via Vercel CLI ---
echo -e "\n${BLUE}=== Deploying ${APP} via Vercel CLI ===${NC}"

VERCEL_FLAGS="--yes"

if [[ "$TARGET" == "production" ]]; then
  VERCEL_FLAGS="$VERCEL_FLAGS --prod"
  URL="${PRODUCTION_URLS[$APP]}"
else
  URL="${STAGING_URLS[$APP]}"
fi

# Swap .vercel/project.json to point to the target app's Vercel project
# (Vercel projects have Root Directory set on the dashboard, so deploy from repo root)
ORIG_PROJECT=""
if [[ -f .vercel/project.json ]]; then
  ORIG_PROJECT=$(cat .vercel/project.json)
fi
cp -f "$APP_DIR/.vercel/project.json" .vercel/project.json
echo -e "${YELLOW}Running: vercel deploy ${VERCEL_FLAGS} (project: ${APP})${NC}"
DEPLOY_URL=$(vercel deploy $VERCEL_FLAGS 2>&1)
# Restore original .vercel/project.json
if [[ -n "$ORIG_PROJECT" ]]; then
  echo "$ORIG_PROJECT" > .vercel/project.json
fi

echo -e "\n${GREEN}=== ${APP^^} deployed to ${TARGET^^} ===${NC}"
echo -e "App URL:    ${YELLOW}${URL}${NC}"
echo -e "Deploy URL: ${YELLOW}${DEPLOY_URL}${NC}"
echo -e "\n${GREEN}Done!${NC}"
