#!/usr/bin/env bash
set -e

# ============================================
# Neram Ecosystem - Unified Deploy Script
# ============================================
# Usage:
#   bash scripts/deploy.sh --target staging
#   bash scripts/deploy.sh --target production
#   bash scripts/deploy.sh --target all
#   bash scripts/deploy.sh --target staging --apps app
#   bash scripts/deploy.sh --target staging --apps marketing,app
#   bash scripts/deploy.sh --target staging --skip-checks --skip-db
# ============================================

# --- Vercel Project IDs ---
ORG_ID="team_pINk5YGOGsajESQgHpsgyoEU"
declare -A VERCEL_PROJECTS=(
  ["marketing"]="prj_kCLOVjMqr99PfKvbdiZdM8vHpNST"
  ["app"]="prj_n1hKWpSZezUx3m3ui0i2eLKq13OR"
  ["nexus"]="prj_CFjPrGMaAA5dzVwU54GaGBE6AKLX"
  ["admin"]="prj_QoCOUGXPvDYAfOXHYFpF62f57hWV"
)

# --- Supabase Project Refs ---
STAGING_SUPABASE="hgxjavrsrvpihqrpezdh"
PRODUCTION_SUPABASE="zdnypksjqnhtiblwdaic"

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

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# --- All valid app names ---
ALL_APPS="marketing app nexus admin"

# --- Defaults ---
TARGET=""
SKIP_CHECKS=false
SKIP_DB=false
DEPLOY_APPS=""

# --- Parse Arguments ---
while [[ $# -gt 0 ]]; do
  case $1 in
    --target)
      TARGET="$2"
      shift 2
      ;;
    --apps)
      DEPLOY_APPS="$2"
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
    *)
      echo -e "${RED}Unknown argument: $1${NC}"
      echo "Usage: bash scripts/deploy.sh --target [staging|production|all] [--apps marketing,app,...] [--skip-checks] [--skip-db]"
      exit 1
      ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  echo -e "${RED}Error: --target is required${NC}"
  echo "Usage: bash scripts/deploy.sh --target [staging|production|all] [--apps marketing,app,...] [--skip-checks] [--skip-db]"
  exit 1
fi

# --- Resolve which apps to deploy ---
if [[ -n "$DEPLOY_APPS" ]]; then
  # Replace commas with spaces
  DEPLOY_APPS="${DEPLOY_APPS//,/ }"
  # Validate each app name
  for app in $DEPLOY_APPS; do
    if [[ ! " $ALL_APPS " =~ " $app " ]]; then
      echo -e "${RED}Error: Unknown app '$app'. Valid apps: $ALL_APPS${NC}"
      exit 1
    fi
  done
else
  DEPLOY_APPS="$ALL_APPS"
fi

echo -e "${BLUE}Apps to deploy: ${DEPLOY_APPS}${NC}"

if [[ "$TARGET" != "staging" && "$TARGET" != "production" && "$TARGET" != "all" ]]; then
  echo -e "${RED}Error: --target must be staging, production, or all${NC}"
  exit 1
fi

# --- Pre-flight Checks ---
echo -e "${BLUE}=== Pre-flight Checks ===${NC}"

for cmd in vercel pnpm; do
  if ! command -v $cmd &>/dev/null; then
    echo -e "${RED}Error: $cmd is not installed or not in PATH${NC}"
    exit 1
  fi
done

# Check supabase via npx (installed as monorepo dependency)
if ! npx supabase --version &>/dev/null 2>&1; then
  echo -e "${RED}Error: supabase CLI is not available (tried npx supabase)${NC}"
  exit 1
fi
echo -e "${GREEN}All CLI tools available${NC}"

# Check VERCEL_TOKEN
if [[ -z "$VERCEL_TOKEN" ]]; then
  echo -e "${YELLOW}Warning: VERCEL_TOKEN not set in environment. Vercel CLI will use interactive auth.${NC}"
fi

# --- Quality Checks ---
if [[ "$SKIP_CHECKS" == false ]]; then
  echo -e "\n${BLUE}=== Running Quality Checks ===${NC}"
  echo -e "${YELLOW}Running type-check...${NC}"
  pnpm type-check
  echo -e "${YELLOW}Running lint...${NC}"
  pnpm lint
  echo -e "${GREEN}Quality checks passed${NC}"
else
  echo -e "${YELLOW}Skipping quality checks (--skip-checks)${NC}"
fi

# --- Deploy Function ---
deploy_env() {
  local env_name="$1"
  local supabase_ref=""

  if [[ "$env_name" == "staging" ]]; then
    supabase_ref="$STAGING_SUPABASE"
  else
    supabase_ref="$PRODUCTION_SUPABASE"
  fi

  echo -e "\n${BLUE}========================================${NC}"
  echo -e "${BLUE}  Deploying to ${env_name^^}${NC}"
  echo -e "${BLUE}========================================${NC}"

  # --- Supabase Migrations ---
  if [[ "$SKIP_DB" == false ]]; then
    echo -e "\n${YELLOW}--- Supabase: Linking project ($supabase_ref) ---${NC}"
    npx supabase link --project-ref "$supabase_ref" ${SUPABASE_DB_PASSWORD:+--password "$SUPABASE_DB_PASSWORD"}

    echo -e "${YELLOW}--- Supabase: Pushing migrations ---${NC}"
    if npx supabase db push ${SUPABASE_DB_PASSWORD:+--password "$SUPABASE_DB_PASSWORD"}; then
      echo -e "${GREEN}Database migrations applied successfully${NC}"
    else
      echo -e "${YELLOW}Warning: Database migration had issues (may already be up to date)${NC}"
    fi
  else
    echo -e "${YELLOW}Skipping database migrations (--skip-db)${NC}"
  fi

  # --- Vercel Deploy Each App ---
  # Deploy from monorepo root — Vercel uses project's rootDirectory setting
  # to resolve which subdirectory (apps/marketing, apps/app, etc.) to build.
  local token_flag=""
  if [[ -n "$VERCEL_TOKEN" ]]; then
    token_flag="--token=$VERCEL_TOKEN"
  fi

  for app_name in $DEPLOY_APPS; do
    local project_id="${VERCEL_PROJECTS[$app_name]}"

    echo -e "\n${YELLOW}--- Deploying $app_name ($project_id) ---${NC}"

    export VERCEL_ORG_ID="$ORG_ID"
    export VERCEL_PROJECT_ID="$project_id"

    echo "  Deploying to Vercel (remote build)..."
    vercel deploy --prod $token_flag --yes

    echo -e "${GREEN}  $app_name deployed successfully${NC}"
  done

  # --- Summary ---
  echo -e "\n${GREEN}=== ${env_name^^} Deployment Complete ===${NC}"
  echo -e "┌──────────────┬──────────────────────────────────────────┐"
  echo -e "│ App          │ URL                                      │"
  echo -e "├──────────────┼──────────────────────────────────────────┤"

  if [[ "$env_name" == "staging" ]]; then
    for app_name in $DEPLOY_APPS; do
      printf "│ %-12s │ %-40s │\n" "$app_name" "${STAGING_URLS[$app_name]}"
    done
  else
    for app_name in $DEPLOY_APPS; do
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
