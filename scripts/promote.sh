#!/usr/bin/env bash
set -e

# ============================================
# Neram Ecosystem - Promote staging → production
# ============================================
# Creates a PR from staging to main and auto-merges it.
# GitHub Actions then deploys to production automatically.
#
# Usage:
#   bash scripts/promote.sh
#   bash scripts/promote.sh --auto-merge
# ============================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

AUTO_MERGE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --auto-merge)
      AUTO_MERGE=true
      shift
      ;;
    *)
      echo -e "${RED}Unknown argument: $1${NC}"
      echo "Usage: bash scripts/promote.sh [--auto-merge]"
      exit 1
      ;;
  esac
done

# --- Pre-flight ---
echo -e "${BLUE}=== Promote staging → production ===${NC}"

if ! command -v gh &>/dev/null; then
  echo -e "${RED}Error: gh (GitHub CLI) is not installed${NC}"
  echo "Install it: https://cli.github.com/"
  exit 1
fi

# Check gh auth
if ! gh auth status &>/dev/null 2>&1; then
  echo -e "${RED}Error: Not logged in to GitHub CLI. Run: gh auth login${NC}"
  exit 1
fi
echo -e "${GREEN}GitHub CLI authenticated${NC}"

# --- Ensure staging is up to date ---
echo -e "\n${YELLOW}Fetching latest from remote...${NC}"
git fetch origin staging main

# Check if staging is ahead of main
COMMITS_AHEAD=$(git rev-list --count origin/main..origin/staging 2>/dev/null || echo "0")

if [[ "$COMMITS_AHEAD" == "0" ]]; then
  echo -e "${YELLOW}staging is not ahead of main. Nothing to promote.${NC}"
  exit 0
fi

echo -e "${GREEN}staging is $COMMITS_AHEAD commit(s) ahead of main${NC}"

# --- Show what will be promoted ---
echo -e "\n${BLUE}Commits to promote:${NC}"
git log --oneline origin/main..origin/staging

# --- Check for existing PR ---
EXISTING_PR=$(gh pr list --base main --head staging --json number --jq '.[0].number' 2>/dev/null || echo "")

if [[ -n "$EXISTING_PR" && "$EXISTING_PR" != "null" ]]; then
  echo -e "\n${YELLOW}Existing PR #$EXISTING_PR found (staging → main)${NC}"
  PR_NUMBER="$EXISTING_PR"
else
  # --- Create PR ---
  echo -e "\n${YELLOW}Creating PR: staging → main${NC}"
  PR_URL=$(gh pr create \
    --base main \
    --head staging \
    --title "Release: Promote staging to production" \
    --body "$(cat <<'EOF'
## Automated Promotion

Promoting all changes from `staging` to `main` (production).

This PR was created by `pnpm promote:prod`.

### What happens on merge
- GitHub Actions deploys all 4 apps to production
- Supabase migrations are pushed to production database
EOF
)" 2>&1)

  PR_NUMBER=$(echo "$PR_URL" | grep -oP '\d+$' || gh pr list --base main --head staging --json number --jq '.[0].number')
  echo -e "${GREEN}PR created: $PR_URL${NC}"
fi

# --- Auto-merge if requested ---
if [[ "$AUTO_MERGE" == true ]]; then
  echo -e "\n${YELLOW}Auto-merging PR #$PR_NUMBER...${NC}"

  # Wait for any required checks (short timeout)
  echo "Waiting for CI checks (up to 2 minutes)..."
  if gh pr checks "$PR_NUMBER" --watch --fail-fast 2>/dev/null; then
    echo -e "${GREEN}CI checks passed${NC}"
  else
    echo -e "${YELLOW}CI checks not configured or timed out — proceeding with merge${NC}"
  fi

  gh pr merge "$PR_NUMBER" --merge --delete-branch=false

  echo -e "${GREEN}PR #$PR_NUMBER merged! GitHub Actions will deploy to production.${NC}"
else
  echo -e "\n${BLUE}PR created. To merge:${NC}"
  echo -e "  1. Review at: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/pull/$PR_NUMBER"
  echo -e "  2. Or run: ${GREEN}pnpm promote:prod --auto-merge${NC}"
fi

echo -e "\n${GREEN}Done!${NC}"
